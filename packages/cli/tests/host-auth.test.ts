import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const authDist = path.join(workspaceRoot, "packages/auth/dist");
const roots: string[] = [];

const READER = { id: "github:583231", provider: "github", name: "The Octocat", handle: "octocat", avatarUrl: "https://github.com/octocat.png", profileUrl: "https://github.com/octocat" };

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a test port");
  const { port } = address;
  server.close();
  await once(server, "close");
  return port;
}

/** `name=value` pairs a browser would send back, from a response's Set-Cookie headers. */
const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!);

/**
 * GitHub at its HTTP edge, preloaded into the built server: it grants a token only for the issued code, the
 * registered callback and a verifier matching the challenge the test hands it in `provider.json`.
 */
const githubStub = (providerFile: string) => `
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const answer = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  // A Request with a body is read as is: wrapping it again would consume that body.
  const request = input instanceof Request ? input : new Request(input, init);
  if (request.url === "https://github.com/login/oauth/access_token") {
    const { challenge, redirectUri } = JSON.parse(readFileSync(${JSON.stringify(providerFile)}, "utf8"));
    const body = new URLSearchParams(await request.text());
    const valid = body.get("code") === "issued-code"
      && body.get("redirect_uri") === redirectUri
      && createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url") === challenge
      && request.headers.get("authorization") === "Basic " + btoa("fake-client-id:fake-client-secret");
    return valid
      ? Response.json({ access_token: "fake-access-token", token_type: "Bearer" })
      : Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (request.url === "https://api.github.com/user" && request.headers.get("authorization") === "Bearer fake-access-token") {
    return Response.json({ id: 583231, login: "octocat", name: "The Octocat" });
  }
  if (request.url.startsWith("https://")) return new Response(null, { status: 401 });
  return answer(input, init);
};
`;

/**
 * An adapter-node host app under the deployment base `base`, rendering every vault through the CLI template's
 * catch-all route: `journal` and `work` enable auth, `plain` doesn't, and `work` carries a plugin that reads whoever
 * signed in. `writeConfig(callbackVault)` sets `work`'s `callbackVault`.
 */
async function createHost(base: string) {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-host-auth-")));
  roots.push(root);
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "node_modules"), "dir");
  await mkdir(path.join(root, "src/routes/[...slug]"), { recursive: true });
  for (const name of ["+page.svelte", "+page.ts"]) {
    await writeFile(path.join(root, "src/routes/[...slug]", name),
      await readFile(path.join(workspaceRoot, "packages/cli/template/src/routes/[...slug]", name)));
  }
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "svartz-host-auth", private: true, type: "module", devDependencies: { "@sveltejs/kit": "^2.0.0" } }));
  await writeFile(path.join(root, "vite.config.ts"), [
    "import { sveltekit } from '@sveltejs/kit/vite';",
    "import { defineConfig } from 'vite';",
    `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
    "export default withSvartzHost(defineConfig({ plugins: [sveltekit()] }));",
  ].join("\n"));
  await writeFile(path.join(root, "svelte.config.js"), `import adapter from '@sveltejs/adapter-node';
export default { kit: { adapter: adapter(), paths: { base: ${JSON.stringify(base)} }, prerender: { handleHttpError: ({ status, path, message }) => {
  if (status === 404 && path.includes('/_svartz/')) return;
  throw new Error(message);
} } } };\n`);
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  await writeFile(path.join(root, "src/hooks.server.ts"),
    "import { svartzHandle } from 'virtual:svartz/server';\nexport const handle = svartzHandle;\n");
  // Another plugin on the second vault, reading whoever signed in.
  await writeFile(path.join(root, "whoami.mjs"), `import { readIdentity } from ${JSON.stringify(path.join(authDist, "server.js"))};
export default () => async (request, context) => Response.json(await readIdentity(request, context.env));\n`);
  const providerFile = path.join(root, "provider.json");
  await writeFile(path.join(root, "github-stub.mjs"), githubStub(providerFile));
  for (const id of ["journal", "work", "plain"]) {
    await mkdir(path.join(root, id, "notes"), { recursive: true });
    await writeFile(path.join(root, id, "index.md"), `# ${id} home\n`);
    await writeFile(path.join(root, id, "notes/page.md"), `# A ${id} page\n`);
  }
  const writeConfig = (callbackVault?: string) => writeFile(path.join(root, "svartz.config.ts"), `
import { auth } from ${JSON.stringify(path.join(authDist, "index.js"))};
const signIn = { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } };
const theme = ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))};
export default {
  version: "1.0.0",
  vaults: [
    { id: "journal", path: "journal", mountPath: "/journal", theme, target: { type: "host" }, plugins: [auth(signIn)] },
    { id: "work", path: "work", mountPath: "/work", theme, target: { type: "host" }, plugins: [
      auth({ ...signIn, ${callbackVault ? `callbackVault: ${JSON.stringify(callbackVault)}` : ""} }),
      { id: "whoami", server: { module: ${JSON.stringify(path.join(root, "whoami.mjs"))} } },
    ] },
    { id: "plain", path: "plain", mountPath: "/plain", theme, target: { type: "host" } },
  ],
};\n`);
  const build = () => execFileAsync(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"), "build", "--config", path.join(root, "svartz.config.ts"),
  ], { cwd: root, maxBuffer: 20_000_000 });
  const buildFailure = () => build().then(() => undefined, (error: { stderr?: string }) => error.stderr ?? String(error));
  return { root, providerFile, writeConfig, build, buildFailure };
}

/**
 * Serve the built host with GitHub stubbed, at `origin` on localhost, where Chromium keeps `Secure` cookies over
 * plain HTTP. `get` is a browser request that stops at sign-in redirects, following the 308 a host's
 * `trailingSlash: 'never'` answers first.
 */
async function serve(root: string, base: string) {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["--import", path.join(root, "github-stub.mjs"), path.join(root, "build/index.js")], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      ORIGIN: origin,
      PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
      PRIVATE_GITHUB_SECRET: "fake-client-secret",
    },
    stdio: "pipe",
  });
  let stderr = "";
  server.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const get = async (pathname: string, cookies: string[] = []): Promise<Response> => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: "manual", headers: { cookie: cookies.join("; ") } });
    return response.status === 308 ? get(response.headers.get("location")!, cookies) : response;
  };
  const stop = async () => {
    server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  };
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    ready = await get(`${base}/journal/`).then(() => true, () => false);
    if (!ready) await sleep(100);
  }
  if (!ready) {
    await stop();
    throw new Error(`The host never answered:\n${stderr}`);
  }
  return { origin, get, stop, stderr: () => stderr };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("signs a reader in on every host vault through one callback vault, and fails a callbackVault that can't run sign-in", async () => {
  const host = await createHost("");
  await host.writeConfig();
  await host.build();
  const { origin, get, stop, stderr } = await serve(host.root, "");
  try {
    // The reader starts on the work vault; its sign-in link hands them to the journal vault, which runs every sign-in.
    const forwarded = await get(`/work/_svartz/auth/start/github/?returnTo=${encodeURIComponent("/work/notes/page/")}`);
    expect(forwarded.status, stderr()).toBe(302);
    const startPath = forwarded.headers.get("location")!;
    expect(startPath).toBe(`/journal/_svartz/auth/start/github/?returnTo=${encodeURIComponent("/work/notes/page/")}`);
    const start = await get(startPath);
    expect(start.status, stderr()).toBe(302);
    const authorization = new URL(start.headers.get("location")!);
    expect(authorization.origin + authorization.pathname).toBe("https://github.com/login/oauth/authorize");
    const redirectUri = authorization.searchParams.get("redirect_uri")!;
    expect(redirectUri).toBe(`${origin}/journal/_svartz/auth/callback/github/`);
    await writeFile(host.providerFile, JSON.stringify({ challenge: authorization.searchParams.get("code_challenge"), redirectUri }));

    // GitHub sends the reader to the one registered callback, which returns them to the work page.
    const callback = await get(
      `/journal/_svartz/auth/callback/github/?code=issued-code&state=${authorization.searchParams.get("state")}`,
      cookiesFrom(start),
    );
    expect(callback.status, stderr()).toBe(302);
    expect(callback.headers.get("location")).toBe("/work/notes/page/");
    const session = cookiesFrom(callback).filter((pair) => pair.startsWith("__Host-svartz-session="));
    expect(session).toHaveLength(1);

    expect(await (await get("/work/_svartz/whoami/", session)).json()).toEqual(READER);
    expect(await (await get("/journal/_svartz/auth/me/", session)).json()).toEqual(READER);
    expect(await (await get("/work/_svartz/auth/me/", session)).json()).toEqual(READER);
    // Providers only know the journal's callback; the work vault's answers nothing.
    expect((await get("/work/_svartz/auth/callback/github/?code=issued-code&state=x", cookiesFrom(start))).status).toBe(404);
  } finally {
    await stop();
  }

  await host.writeConfig("jornal");
  expect(await host.buildFailure()).toContain('vault "work" sets callbackVault "jornal", but no vault has that id');
  await host.writeConfig("plain");
  expect(await host.buildFailure()).toContain('vault "work" sets callbackVault "plain", which must be a host vault that enables auth');
}, 300_000);

it("signs a reader in from the dialog under the host's paths.base", async () => {
  const base = "/site";
  const host = await createHost(base);
  await host.writeConfig();
  await host.build();
  const { origin, get, stop, stderr } = await serve(host.root, base);
  // localhost resolves to the IPv4 address the server listens on.
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP localhost 127.0.0.1"] });
  try {
    // A vault that isn't the callback vault forwards its sign-ins to the callback vault's, under the base.
    const forwarded = await get(`${base}/work/_svartz/auth/start/github/?returnTo=${encodeURIComponent(`${base}/work/`)}`);
    expect(forwarded.status, stderr()).toBe(302);
    expect(forwarded.headers.get("location")).toBe(`${base}/journal/_svartz/auth/start/github/?returnTo=${encodeURIComponent(`${base}/work/`)}`);

    const context = await browser.newContext();
    // Playwright doesn't route a request reached through a redirect, so GitHub's part is played at the start link:
    // the server's redirects run here, and the last, to GitHub, gets GitHub's approval back to the callback it named.
    let redirectUri = "";
    await context.route(/\/_svartz\/auth\/start\/github\//, async (route) => {
      let response = await route.fetch({ maxRedirects: 0 });
      while (!response.headers().location!.startsWith("https://github.com/")) {
        response = await route.fetch({ url: new URL(response.headers().location!, route.request().url()).href, maxRedirects: 0 });
      }
      const authorization = new URL(response.headers().location!);
      redirectUri = authorization.searchParams.get("redirect_uri")!;
      await writeFile(host.providerFile, JSON.stringify({ challenge: authorization.searchParams.get("code_challenge"), redirectUri }));
      await route.fulfill({ response, headers: { ...response.headers(), location: `${redirectUri}?code=issued-code&state=${authorization.searchParams.get("state")}` } });
    });
    const page = await context.newPage();
    const pagePath = `${base}/work/notes/page`;
    await page.goto(`${origin}${pagePath}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "A work page" }).waitFor();
    await page.evaluate(() => {
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.textContent = "Sign in";
      trigger.setAttribute("data-svartz-sign-in", "");
      document.body.append(trigger);
    });
    await page.getByRole("button", { name: "Sign in" }).click();

    const provider = page.getByRole("link", { name: "Continue with GitHub" });
    expect(await provider.getAttribute("href"))
      .toBe(`${base}/journal/_svartz/auth/start/github/?returnTo=${encodeURIComponent(pagePath)}`);
    await provider.click();
    await page.waitForURL(`${origin}${pagePath}`);

    expect(redirectUri).toBe(`${origin}${base}/journal/_svartz/auth/callback/github/`);
    const readFromPage = (route: string) => page.evaluate((route) => fetch(route).then((response) => response.json()), route);
    expect(await readFromPage(`${base}/work/_svartz/whoami/`)).toEqual(READER);
    expect(await readFromPage(`${base}/journal/_svartz/auth/me/`)).toEqual(READER);
  } finally {
    await browser.close();
    await stop();
  }
}, 300_000);

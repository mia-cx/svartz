import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { chromium, type Page } from "playwright";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const shellModules = path.join(workspaceRoot, "apps/web/node_modules");
const annotationsDist = path.join(workspaceRoot, "packages/plugin-annotations/dist");
const authDist = path.join(workspaceRoot, "packages/auth/dist");
const roots: string[] = [];

const BASE = "/site";
const ROSES = "Roses want six hours of sun and a deep weekly soak.";
const TULIPS = "Tulips open in the morning sun and close again at dusk.";
const PEARS = "Pears ripen off the tree, in a cool and dark drawer.";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a test port");
  server.close();
  await once(server, "close");
  return address.port;
}

/** GitHub at its HTTP edge, preloaded into the dev server: it vouches for the octocat when handed the issued code. */
const GITHUB_STUB = `
const answer = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  if (request.url === "https://github.com/login/oauth/access_token") {
    const body = new URLSearchParams(await request.text());
    return body.get("code") === "issued-code"
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

/** The note route docs/host-vaults.md shows: the garden vault's notes in the host's own page, through SvartzNoteContent. */
const NOTE_ROUTE = {
  "+page.server.ts": `import { noteStylesheets } from '@svartz/ui/runtime';
import { vaults } from 'virtual:svartz/host';
const garden = vaults.find((vault) => vault.id === 'garden');
export const load = async ({ url }) => {
  const appPath = url.pathname.slice(garden.basePath.length) || '/';
  const pathname = appPath.endsWith('/') ? appPath : appPath + '/';
  return { stylesheets: await noteStylesheets(pathname) };
};
`,
  "+page.ts": `import { error } from '@sveltejs/kit';
import { prepareHostVault, vaults } from 'virtual:svartz/host';
export const trailingSlash = 'always';
const garden = vaults.find((vault) => vault.id === 'garden');
export const load = async ({ url, data }) => {
  const appPath = url.pathname.slice(garden.basePath.length) || '/';
  const pathname = appPath.endsWith('/') ? appPath : appPath + '/';
  if (!garden.artifacts.index.routes.notes.includes(pathname)) error(404, 'Note not found');
  await prepareHostVault(pathname);
  return { ...data, pathname };
};
`,
  "+page.svelte": `<script lang="ts">
  import { base } from '$app/paths';
  import { SvartzNoteContent } from '@svartz/ui/runtime';
  let { data } = $props();
</script>
<nav><a href="{base}/essays/tulips/">Tulips essay</a></nav>
<h1>Host note page</h1>
<SvartzNoteContent pathname={data.pathname} stylesheets={data.stylesheets} />
`,
};

/** A page the host renders itself from the vault's Markdown, with annotations from one `attach` call. */
const ESSAY_ROUTE = {
  "+page.ts": `import { error } from '@sveltejs/kit';
import { vaults } from 'virtual:svartz/host';
export const trailingSlash = 'always';
const garden = vaults.find((vault) => vault.id === 'garden');
export const load = ({ params }) => {
  const entry = garden.artifacts.index.entries.find((candidate) => candidate.slug === 'essays/' + params.slug);
  if (!entry?.markdown) error(404, 'Essay not found');
  return { slug: entry.slug, text: entry.markdown.trim() };
};
`,
  "+page.svelte": `<script lang="ts">
  import { base } from '$app/paths';
  import { vaults } from 'virtual:svartz/host';
  import { attach } from ${JSON.stringify(path.join(annotationsDist, "browser.js"))};
  import ${JSON.stringify(path.join(annotationsDist, "browser.css"))};
  let { data } = $props();
  const garden = vaults.find((vault) => vault.id === 'garden');
</script>
<nav><a href="{base}/">Host home</a></nav>
<h1>Host essay page</h1>
<article {@attach (element) => attach(element, { vault: garden, slug: data.slug })}><p>{data.text}</p></article>
`,
};

/** A host page showing several notes, each through its own SvartzNoteContent. */
const notesRoute = (pathnames: readonly string[]) => ({
  "+page.server.ts": `import { noteStylesheets } from '@svartz/ui/runtime';
const pathnames = ${JSON.stringify(pathnames)};
export const load = async () => ({ stylesheets: (await Promise.all(pathnames.map(noteStylesheets))).flat() });
`,
  "+page.ts": `import { prepareHostVault } from 'virtual:svartz/host';
export const trailingSlash = 'always';
const pathnames = ${JSON.stringify(pathnames)};
export const load = async ({ data }) => {
  await Promise.all(pathnames.map(prepareHostVault));
  return { ...data, pathnames };
};
`,
  "+page.svelte": `<script lang="ts">
  import { SvartzNoteContent } from '@svartz/ui/runtime';
  let { data } = $props();
</script>
<h1>Host notes page</h1>
{#each data.pathnames as pathname (pathname)}
  <section data-note={pathname}><SvartzNoteContent {pathname} stylesheets={data.stylesheets} /></section>
{/each}
`,
});

async function writeRoute(root: string, route: string, files: Record<string, string>) {
  await mkdir(path.join(root, "src/routes", route), { recursive: true });
  for (const [name, source] of Object.entries(files)) await writeFile(path.join(root, "src/routes", route, name), source);
}

/**
 * A host app on adapter-cloudflare under the deployment base `/site`, with `garden` and `orchard` vaults running auth
 * and annotations on one D1.
 */
async function createHost(): Promise<string> {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-host-annotations-")));
  roots.push(root);
  await symlink(shellModules, path.join(root, "node_modules"), "dir");
  await mkdir(path.join(root, "garden/essays"), { recursive: true });
  await mkdir(path.join(root, "src/routes"), { recursive: true });
  await writeFile(path.join(root, "garden/roses.md"), `${ROSES}\n`);
  await writeFile(path.join(root, "garden/essays/tulips.md"), `${TULIPS}\n`);
  await mkdir(path.join(root, "orchard"));
  await writeFile(path.join(root, "orchard/pears.md"), `${PEARS}\n`);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "svartz-host-annotations", private: true, type: "module", devDependencies: { "@sveltejs/kit": "^2.0.0" } }));
  await writeFile(path.join(root, "vite.config.ts"), [
    "import { sveltekit } from '@sveltejs/kit/vite';",
    "import { defineConfig } from 'vite';",
    `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
    // node_modules links to the workspace's, outside this root, where the dev server must serve SvelteKit's client from.
    `export default withSvartzHost(defineConfig({ plugins: [sveltekit()], server: { fs: { allow: [${JSON.stringify(workspaceRoot)}] } } }));`,
  ].join("\n"));
  await writeFile(path.join(root, "svelte.config.js"),
    `import adapter from '@sveltejs/adapter-cloudflare';\nexport default { kit: { adapter: adapter(), paths: { base: ${JSON.stringify(BASE)} } } };\n`);
  await writeFile(path.join(root, "wrangler.jsonc"), JSON.stringify({
    name: "garden",
    compatibility_date: "2026-03-03",
    main: ".svelte-kit/cloudflare/_worker.js",
    d1_databases: [{ binding: "DB", database_name: "garden-annotations", database_id: "00000000-0000-0000-0000-000000000000" }],
  }));
  await writeFile(path.join(root, ".dev.vars"), "PRIVATE_SVARTZ_SESSION_SECRET=test-secret-0123456789-abcdefghijklmnop\nPRIVATE_GITHUB_SECRET=fake-client-secret\n");
  await writeFile(path.join(root, "github-stub.mjs"), GITHUB_STUB);
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  await writeFile(path.join(root, "src/hooks.server.ts"), "import { svartzHandle } from 'virtual:svartz/server';\nexport const handle = svartzHandle;\n");
  await writeFile(path.join(root, "src/routes/+page.svelte"), "<h1>Host home</h1>\n");
  await writeRoute(root, "garden/[...slug]", NOTE_ROUTE);
  await writeRoute(root, "essays/[slug]", ESSAY_ROUTE);
  await writeRoute(root, "same-vault", notesRoute(["/garden/roses/", "/garden/essays/tulips/"]));
  await writeRoute(root, "two-vaults", notesRoute(["/garden/roses/", "/orchard/pears/"]));
  await writeFile(path.join(root, "svartz.config.ts"), `
import { auth } from ${JSON.stringify(path.join(authDist, "index.js"))};
import { annotations } from ${JSON.stringify(path.join(annotationsDist, "index.js"))};
const plugins = () => [
  auth({ providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } }),
  annotations({ database: { env: "DB" } }),
];
const theme = ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))};
export default {
  version: "1.0.0",
  vaults: [
    { id: "garden", path: "garden", mountPath: "/garden", theme, target: { type: "host" }, index: { markdown: true }, plugins: plugins() },
    { id: "orchard", path: "orchard", mountPath: "/orchard", theme, target: { type: "host" }, plugins: plugins() },
  ],
};\n`);
  return root;
}

/** Run `svartz dev` in `root` with GitHub stubbed, until `ready` answers. */
async function startDev(root: string, ready: string): Promise<{ origin: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const dev = spawn(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"), "dev",
    "--config", path.join(root, "svartz.config.ts"), "--host", "127.0.0.1", "--port", String(port),
  ], {
    cwd: root,
    // The dev server runs in a child process, which inherits the stub through NODE_OPTIONS.
    env: { ...process.env, NODE_OPTIONS: `--import ${path.join(root, "github-stub.mjs")}` },
    stdio: "pipe",
  });
  let output = "";
  dev.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  dev.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const origin = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (dev.exitCode !== null) return;
    dev.kill("SIGTERM");
    await once(dev, "exit");
  };
  for (let attempt = 0; attempt < 1_200; attempt++) {
    if (dev.exitCode !== null) throw new Error(`svartz dev exited:\n${output}`);
    if (await fetch(`${origin}${ready}`).then((response) => response.ok, () => false)) return { origin, stop };
    await sleep(100);
  }
  await stop();
  throw new Error(`svartz dev never answered:\n${output}`);
}

/** Sign in through auth's real routes, with GitHub stubbed, and answer the session cookie's value. */
async function signIn(origin: string): Promise<string> {
  const start = await fetch(`${origin}${BASE}/garden/_svartz/auth/start/github/?returnTo=${encodeURIComponent(`${BASE}/garden/roses/`)}`, { redirect: "manual" });
  expect(start.status, await start.clone().text()).toBe(302);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const flow = start.headers.getSetCookie().map((header) => header.split(";")[0]!).join("; ");
  const callback = await fetch(`${origin}${BASE}/garden/_svartz/auth/callback/github/?code=issued-code&state=${state}`, {
    redirect: "manual",
    headers: { cookie: flow },
  });
  expect(callback.status, await callback.clone().text()).toBe(302);
  const session = callback.headers.getSetCookie().find((header) => header.startsWith("__Host-svartz-session="));
  expect(session).toBeDefined();
  return session!.split(";")[0]!.slice("__Host-svartz-session=".length);
}

/** Select `quote` in the note body under `selector` and post `body` on it from the toolbar. */
async function comment(page: Page, selector: string, quote: string, body: string) {
  // The layer beside the note: annotations have attached and listen for the selection.
  await page.locator(`${selector} + .sv-annotations`).waitFor({ state: "attached" });
  await page.evaluate(({ selector, quote }) => {
    const root = document.querySelector(selector)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent!.indexOf(quote);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + quote.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return;
    }
    throw new Error(`"${quote}" is not in ${selector}`);
  }, { selector, quote });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.keyboard.type(body);
  await page.getByRole("button", { name: "Post comment" }).click();
}

const highlighted = (page: Page) =>
  page.evaluate(() => [...CSS.highlights.get("svartz-annotations") ?? []].map((range) => range.toString()));

/** The annotations `wrangler d1 execute --local` reads from the host's local D1. */
async function storedComments(root: string): Promise<Array<{ vault: string; page: string; body: string }>> {
  const { stdout } = await execFileAsync(path.join(shellModules, ".bin/wrangler"), [
    "d1", "execute", "DB", "--local", "--json", "--command", "SELECT vault, page, body FROM annotations ORDER BY vault, page",
  ], { cwd: root, env: { ...process.env, CI: "1" } });
  const [result] = JSON.parse(stdout) as Array<{ results: Array<{ vault: string; page: string; body: string }> }>;
  return result?.results ?? [];
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("shows annotations on a host's own pages under a deployment base, and detaches when the reader navigates away", async () => {
  const root = await createHost();
  const dev = await startDev(root, `${BASE}/`);
  const browser = await chromium.launch();
  try {
    const session = await signIn(dev.origin);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Chromium sends a `Secure` cookie to http://127.0.0.1, but only takes one set for https.
    await context.addCookies([{ name: "__Host-svartz-session", value: session, url: dev.origin.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);
    // Vite discovers dependencies on first visit and reloads the page once it has optimized them; settle that first.
    const warmup = await context.newPage();
    for (const pathname of ["/garden/roses/", "/essays/tulips/"]) {
      for (let attempt = 0; attempt < 5; attempt++) {
        let stale = false;
        const onResponse = (response: { status: () => number }) => { if (response.status() === 504) stale = true; };
        warmup.on("response", onResponse);
        await warmup.goto(`${dev.origin}${BASE}${pathname}`, { waitUntil: "networkidle" });
        warmup.off("response", onResponse);
        if (!stale) break;
      }
    }
    await warmup.close();

    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });

    // SvartzNoteContent marks the note body, so the vault's annotations attach with no host code.
    await page.goto(`${dev.origin}${BASE}/garden/roses/`);
    await page.getByRole("heading", { name: "Host note page" }).waitFor();
    await comment(page, "[data-svartz-note]", "a deep weekly soak", "Twice in a heatwave.");
    await page.getByRole("button", { name: /^Comment by The Octocat on “a deep weekly soak”/ }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /^Comment by The Octocat on “a deep weekly soak”/ }).waitFor();
    expect(await highlighted(page)).toEqual(["a deep weekly soak"]);

    // The host's own markup, named by vault and slug: the comment is stored under the note's slug, beside its passage.
    await page.getByRole("link", { name: "Tulips essay" }).click();
    await page.getByRole("heading", { name: "Host essay page" }).waitFor();
    await expect.poll(() => page.locator(".sv-annotations-marker").count()).toBe(0);
    expect(await highlighted(page)).toEqual([]);
    await comment(page, "article", "close again at dusk", "Mine stay shut on grey days.");
    await page.getByRole("button", { name: /^Comment by The Octocat on “close again at dusk”/ }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /^Comment by The Octocat on “close again at dusk”/ }).waitFor();
    expect(await highlighted(page)).toEqual(["close again at dusk"]);

    // Navigating away detaches: no markers, cards or highlights stay behind on the host page.
    await page.getByRole("link", { name: "Host home" }).click();
    await page.getByRole("heading", { name: "Host home" }).waitFor();
    expect(await page.locator(".sv-annotations, .sv-annotations-card, .sv-annotations-toolbar").count()).toBe(0);
    expect(await page.evaluate(() => CSS.highlights.has("svartz-annotations"))).toBe(false);
    expect(failures).toEqual([]);
  } finally {
    await browser.close();
    await dev.stop();
  }

  expect(await storedComments(root)).toEqual([
    { vault: "garden", page: "essays/tulips", body: "Mine stay shut on grey days." },
    { vault: "garden", page: "roses", body: "Twice in a heatwave." },
  ]);
}, 300_000);

it("keeps each note's annotations on its own body when a host page shows two, from one vault or two", async () => {
  const root = await createHost();
  const dev = await startDev(root, `${BASE}/`);
  const browser = await chromium.launch();
  try {
    const session = await signIn(dev.origin);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "__Host-svartz-session", value: session, url: dev.origin.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    // Vite reloads the page once it has optimized dependencies on first visit; settle that before counting failures.
    for (const route of ["/same-vault/", "/two-vaults/"]) await page.goto(`${dev.origin}${BASE}${route}`, { waitUntil: "networkidle" });

    /** Each note's marker labels, by the pathname its section shows. */
    const markersByNote = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>("[data-note]")].map((section) => {
      const body = section.querySelector("[data-svartz-note]")!;
      const layer = body.nextElementSibling?.matches(".sv-annotations") ? body.nextElementSibling : null;
      return [section.dataset.note, [...layer?.querySelectorAll(".sv-annotations-marker") ?? []].map((marker) => marker.getAttribute("aria-label"))];
    })));

    for (const [route, second, quote, body] of [
      ["/same-vault/", "/garden/essays/tulips/", "close again at dusk", "Mine stay shut on grey days."],
      ["/two-vaults/", "/orchard/pears/", "a cool and dark drawer", "The vegetable drawer works."],
    ] as const) {
      await page.goto(`${dev.origin}${BASE}${route}`);
      await page.getByRole("heading", { name: "Host notes page" }).waitFor();
      await expect.poll(() => page.locator(".sv-annotations").count()).toBe(2);
      // A comment on the second note marks that note alone.
      await comment(page, `[data-note="${second}"] [data-svartz-note]`, quote, body);
      await page.getByRole("button", { name: new RegExp(`^Comment by The Octocat on “${quote}”`) }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: new RegExp(`^Comment by The Octocat on “${quote}”`) }).waitFor();
      expect(await markersByNote()).toEqual({ "/garden/roses/": [], [second]: [`Comment by The Octocat on “${quote}”`] });
    }
    expect(failures).toEqual([]);
  } finally {
    await browser.close();
    await dev.stop();
  }

  // Stored under the vault and slug of the note commented on.
  expect(await storedComments(root)).toEqual([
    { vault: "garden", page: "essays/tulips", body: "Mine stay shut on grey days." },
    { vault: "orchard", page: "pears", body: "The vegetable drawer works." },
  ]);
}, 300_000);

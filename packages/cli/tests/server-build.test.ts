import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { access, cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(workspaceRoot, "packages/cli/dist/index.js");
const HANDLER_MARKER = "svartz-hello-handler";
const BUILD_TIMEOUT = 240_000;
const unicodeNotes = [["café", "Prerendered café note."], ["日本語", "Prerendered Japanese note."]] as const;

let root: string;

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

/** Text of every file below `directory`, keyed by path. */
async function readTree(directory: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      files.set(file, await readFile(file, "utf8"));
    }
  }
  return files;
}

function filesContaining(tree: Map<string, string>, text: string): string[] {
  return [...tree].filter(([, contents]) => contents.includes(text)).map(([file]) => file);
}

/** Write a one-vault config for `target` whose `hello` plugin serves requests, then run `svartz build`. */
async function build(target: Record<string, unknown>, { serverPlugin = true, mountPath = "" } = {}) {
  await rm(path.join(root, ".svartz"), { recursive: true, force: true });
  // Crawler links to runtime plugin URLs must neither fail the build nor become static pages.
  await writeFile(path.join(root, "vault/index.md"), `# Home\n\nPrerendered welcome. ${serverPlugin ? "[Say hello](/_svartz/hello/) or [ping](/_svartz/hello/ping)." : ""}\n`);
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "site",
      path: "vault",
      mountPath: ${JSON.stringify(mountPath)},
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: ${JSON.stringify(target)},
      site: { title: "Server site" },
      plugins: [{
        id: "hello",
        disabled: ${!serverPlugin},
        server: {
          module: ${JSON.stringify(path.join(root, "plugins/hello.mjs"))},
          options: JSON.parse('{ "greeting": "hi", "token": { "env": "HELLO_TOKEN" }, "__proto__": { "own": true } }'),
        },
      }],
    }],
  };\n`);
  return execFileAsync(process.execPath, [cli, "build", "--config", path.join(root, "svartz.config.ts")], {
    cwd: root,
    maxBuffer: 20_000_000,
  });
}

beforeAll(async () => {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-server-build-")));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
  // The standalone shell is the repository's apps/web; copy it so each build owns its .svelte-kit.
  await cp(path.join(workspaceRoot, "apps/web"), path.join(root, "apps/web"), {
    recursive: true,
    filter: (source) => !/[\\/](?:node_modules|\.svelte-kit|build)$/.test(source),
  });
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "apps/web/node_modules"), "dir");
  await mkdir(path.join(root, "vault"));
  await mkdir(path.join(root, "plugins"));
  await writeFile(path.join(root, "vault/source.md"), "---\nslug: guide\n---\n# Guide\n\nPublished guide. Read [[other]].\n");
  await writeFile(path.join(root, "vault/other.md"), "# Other\n\nLinked page.\n");
  for (const [slug, content] of unicodeNotes) {
    await writeFile(path.join(root, "vault", `${slug}.md`), `# ${slug}\n\n${content}\n`);
  }
  await writeFile(path.join(root, "vault/private.md"), "---\nprivate: true\n---\n# PRIVATE_MARKER\n");
  await writeFile(path.join(root, "plugins/hello.mjs"), `export default (options) => (request, context) => {
    if (new URL(request.url).pathname !== context.base + "/") return undefined;
    return Response.json({
      marker: ${JSON.stringify(HANDLER_MARKER)},
      method: request.method,
      greeting: options.greeting,
      ownProto: Object.hasOwn(options, "__proto__"),
      token: context.env[options.token.env] ?? null,
      base: context.base,
      vault: context.vault.id,
      clientAddress: context.clientAddress,
    });
  };\n`);
}, BUILD_TIMEOUT);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("standalone builds with a server plugin", () => {
  it("fails a static vault, naming the vault and plugin", async () => {
    const failure = await build({ type: "static" }).then(() => undefined, (error: { stderr?: string }) => error);
    expect(failure?.stderr).toContain('Vault "site" targets "static", but plugin "hello" serves requests.');
  }, BUILD_TIMEOUT);

  it.each([true, false])("negotiates prerendered pages in Node (server plugin %s)", async (serverPlugin) => {
    const prefix = serverPlugin ? "" : "/site/docs";
    // Exercise generated host loaders too, under a deployment base and vault mount.
    const catchall = path.join(root, "apps/web/src/routes/[...slug]");
    const originalLoad = await readFile(path.join(catchall, "+page.ts"));
    if (!serverPlugin) {
      for (const name of ["+page.ts", "+page.server.ts"]) {
        await cp(path.join(workspaceRoot, "packages/cli/template/src/routes/[...slug]", name), path.join(catchall, name));
      }
    }
    try {
      await build({ type: "node", basePath: serverPlugin ? "" : "/site" }, { serverPlugin, mountPath: serverPlugin ? "" : "/docs" });
    } finally {
      await writeFile(path.join(catchall, "+page.ts"), originalLoad);
      if (!serverPlugin) await rm(path.join(catchall, "+page.server.ts"));
    }
    const dist = path.join(root, ".svartz/vaults/site/dist");
    await access(path.join(dist, "index.js"));
    expect(await readFile(path.join(dist, "prerendered", prefix, "index.html"), "utf8")).toContain("Prerendered welcome.");
    for (const [slug, content] of unicodeNotes) {
      expect(await readFile(path.join(dist, "prerendered", prefix, slug, "index.html"), "utf8")).toContain(content);
    }
    expect([...(await readTree(path.join(dist, "prerendered"))).keys()].filter((file) => file.includes("_svartz"))).toEqual([]);
    const client = await readTree(path.join(dist, "client"));
    expect(filesContaining(client, HANDLER_MARKER)).toEqual([]);
    expect(filesContaining(client, "HELLO_TOKEN")).toEqual([]);

    const port = await freePort();
    const server = spawn(process.execPath, [path.join(dist, "index.js")], {
      cwd: root,
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), HELLO_TOKEN: "s3cret" },
      stdio: "pipe",
    });
    let stderr = "";
    server.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const origin = `http://127.0.0.1:${port}${prefix}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await fetch(`${origin}/`).then(() => true, () => false);
        if (!ready) await sleep(100);
      }
      expect(ready, stderr).toBe(true);

      if (serverPlugin) {
        const answer = await fetch(`${origin}/_svartz/hello/`, { method: "POST", body: "hi" });
        expect(answer.status).toBe(200);
        expect(await answer.json()).toEqual({
          marker: HANDLER_MARKER,
          method: "POST",
          greeting: "hi",
          ownProto: true,
          token: "s3cret",
          base: "/_svartz/hello",
          vault: "site",
          clientAddress: "127.0.0.1",
        });
        const unslashed = await fetch(`${origin}/_svartz/hello?x=1`, { method: "POST", body: "hi", redirect: "manual" });
        expect([unslashed.status, unslashed.headers.get("location")]).toEqual([308, "/_svartz/hello/?x=1"]);
        expect((await fetch(`${origin}/_svartz/hello/elsewhere/`)).status).toBe(404);
        expect((await fetch(`${origin}/_svartz/nope/`)).status).toBe(404);
      }
      const home = await fetch(`${origin}/`);
      expect(home.headers.get("vary")).toContain("Accept");
      expect(home.headers.get("vary")).toContain("User-Agent");
      expect(await home.text()).toContain("Prerendered welcome.");
      // Proves non-ASCII notes are built and served at encoded URLs, including under a base and mount.
      for (const [slug, content] of unicodeNotes) {
        const note = await fetch(`${origin}/${encodeURIComponent(slug)}/`);
        expect(note.status).toBe(200);
        expect(await note.text()).toContain(content);
      }
      expect((await fetch(`${origin}/%E0%A4%A/`)).status).toBe(404);

      // Proves page URLs negotiate the emitted copy ahead of adapter-node's static HTML middleware.
      const agent = await fetch(`${origin}/guide/`, { headers: { "user-agent": "ClaudeBot/1.0" } });
      expect(agent.headers.get("content-type")).toContain("text/markdown");
      const copy = await agent.text();
      expect(copy).toBe(await readFile(path.join(dist, "client", prefix, "guide.md"), "utf8"));
      // Without site.url the copy's links are relative, so they must resolve against the URL the agent ends up at.
      const link = /\]\(([^)]+)\)/.exec(copy.slice(copy.indexOf("Read")))?.[1];
      const linked = await fetch(new URL(link!, agent.url));
      expect([linked.status, await linked.text()]).toEqual([200, expect.stringContaining("Linked page.")]);
      const markdown = await fetch(`${origin}/`, { headers: { accept: "text/markdown" }, redirect: "manual" });
      expect([markdown.status, markdown.headers.get("location")]).toEqual([303, `${prefix}/index.md`]);
      expect(markdown.headers.get("vary")).toContain("User-Agent");
      const head = await fetch(`${origin}/guide/`, { method: "HEAD", headers: { accept: "text/markdown" } });
      expect(head.headers.get("content-type")).toContain("text/markdown");
      expect(await head.text()).toBe("");
      const browser = await fetch(`${origin}/guide/`, { headers: { accept: "text/html, text/markdown;q=0.5" } });
      expect(browser.headers.get("content-type")).toContain("text/html");
      expect((await fetch(`${origin}/private/`, { headers: { accept: "text/markdown" } })).status).toBe(404);
    } finally {
      server.kill("SIGTERM");
      if (server.exitCode === null) await once(server, "exit");
    }
  }, BUILD_TIMEOUT);

  it("keeps Markdown copies in a static build without server plugins", async () => {
    await build({ type: "static" }, { serverPlugin: false });
    const dist = path.join(root, ".svartz/vaults/site/dist");
    expect(await readFile(path.join(dist, "index.html"), "utf8")).toContain("Prerendered welcome.");
    expect(await readFile(path.join(dist, "guide.md"), "utf8")).toContain("Published guide.");
    await expect(access(path.join(dist, "private.md"))).rejects.toMatchObject({ code: "ENOENT" });
  }, BUILD_TIMEOUT);

  for (const type of ["cloudflare-workers", "cloudflare-pages"]) {
    it(`emits a ${type} worker that bundles the plugin, with notes prerendered as assets`, async () => {
      await build({ type });
      const output = path.join(root, ".svartz/vaults/site/.svelte-kit");
      const assets = path.join(output, "cloudflare");
      await access(path.join(assets, "_worker.js"));
      expect(await readFile(path.join(assets, "index.html"), "utf8")).toContain("Prerendered welcome.");
      expect(filesContaining(await readTree(path.join(output, "output/server")), HANDLER_MARKER)).not.toEqual([]);
      expect(filesContaining(await readTree(path.join(assets, "_app")), HANDLER_MARKER)).toEqual([]);
    }, BUILD_TIMEOUT);
  }

  // Pages skips the worker for excluded paths, and those follow the routes' trailingSlash rather than Svartz's hrefs.
  it("routes slashless prerendered pages through the Pages worker", async () => {
    const layout = path.join(root, "apps/web/src/routes/+layout.ts");
    const original = await readFile(layout, "utf8");
    await writeFile(layout, original.replace("'always'", "'never'"));
    try {
      await build({ type: "cloudflare-pages" });
    } finally {
      await writeFile(layout, original);
    }
    const routes = JSON.parse(await readFile(path.join(root, ".svartz/vaults/site/.svelte-kit/cloudflare/_routes.json"), "utf8"));
    expect(routes.exclude).toContain("/guide.md");
    expect(routes.exclude.filter((pattern: string) => /^\/(?:guide|other)/.test(pattern) && !pattern.endsWith(".md"))).toEqual([]);
  }, BUILD_TIMEOUT);
});

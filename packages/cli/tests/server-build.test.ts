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
async function build(target: Record<string, unknown>) {
  await rm(path.join(root, ".svartz"), { recursive: true, force: true });
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "site",
      path: "vault",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: ${JSON.stringify(target)},
      site: { title: "Server site" },
      plugins: [{
        id: "hello",
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
  // The standalone shell is the repository's apps/web; copy it so each build owns its .svelte-kit.
  await cp(path.join(workspaceRoot, "apps/web"), path.join(root, "apps/web"), {
    recursive: true,
    filter: (source) => !/[\\/](?:node_modules|\.svelte-kit|build)$/.test(source),
  });
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "apps/web/node_modules"), "dir");
  await mkdir(path.join(root, "vault"));
  await mkdir(path.join(root, "plugins"));
  await writeFile(path.join(root, "vault/index.md"), "# Home\n\nPrerendered welcome.\n");
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

  it("serves the plugin from a Node build while notes stay prerendered", async () => {
    await build({ type: "node" });
    const dist = path.join(root, ".svartz/vaults/site/dist");
    await access(path.join(dist, "index.js"));
    expect(await readFile(path.join(dist, "prerendered/index.html"), "utf8")).toContain("Prerendered welcome.");
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
    const origin = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100 && !ready; attempt++) {
        ready = await fetch(`${origin}/`).then(() => true, () => false);
        if (!ready) await sleep(100);
      }
      expect(ready, stderr).toBe(true);

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
      const home = await fetch(`${origin}/`);
      expect(await home.text()).toContain("Prerendered welcome.");
    } finally {
      server.kill("SIGTERM");
    }
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
});

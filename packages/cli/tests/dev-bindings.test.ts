import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(workspaceRoot, "packages/cli/dist/index.js");
const wranglerBin = path.join(workspaceRoot, "packages/cli/node_modules/.bin/wrangler");
// The host test's app runs SvelteKit 2 with `svelte.config.js`.
const kit2Toolchain = path.join(import.meta.dirname, "fixtures/sveltekit-2-host/node_modules");
const DEV_TIMEOUT = 240_000;
const roots: string[] = [];

const GUESTBOOK = `export default (options) => async (request, context) => {
  const db = context.env[options.database.env];
  await db.prepare("CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, body TEXT NOT NULL)").run();
  if (request.method === "POST") await db.prepare("INSERT INTO entries (body) VALUES (?)").bind(await request.text()).run();
  const { results } = await db.prepare("SELECT body FROM entries ORDER BY id").all();
  return Response.json({
    entries: results.map((row) => row.body),
    dotenv: context.env.PRIVATE_DOTENV_TOKEN ?? null,
    vars: context.env.GREETING ?? null,
    secret: context.env.PRIVATE_SECRET ?? null,
  });
};\n`;

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

/** The guestbook's bindings: a var and the D1 database `DB`. */
const GUESTBOOK_BINDINGS = {
  vars: { GREETING: "from-wrangler" },
  d1_databases: [{ binding: "DB", database_name: "guestbook", database_id: "00000000-0000-0000-0000-000000000000" }],
};

/**
 * A fresh project directory holding a `guestbook` server plugin, `.dev.vars` and `.env`, and, given `wranglerConfig`,
 * a Wrangler config with {@link GUESTBOOK_BINDINGS}.
 */
async function createProject(prefix: string, wranglerConfig?: Record<string, unknown>): Promise<string> {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  roots.push(root);
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "vault/index.md"), "# Guestbook\n");
  await writeFile(path.join(root, "guestbook.mjs"), GUESTBOOK);
  await writeFile(path.join(root, ".dev.vars"), "PRIVATE_SECRET=from-dev-vars\n");
  // SvelteKit 3's `$env/dynamic/private` holds only declared variables, so `.env` reaches plugins through svartz dev.
  await writeFile(path.join(root, ".env"), "PRIVATE_DOTENV_TOKEN=from-dotenv\n");
  if (wranglerConfig) {
    await writeFile(path.join(root, "wrangler.jsonc"), `// Bindings for svartz dev\n${JSON.stringify({
      name: "guestbook",
      compatibility_date: "2026-03-03",
      ...GUESTBOOK_BINDINGS,
      ...wranglerConfig,
    }, null, 2)}\n`);
  }
  return root;
}

async function writeConfig(root: string, vault: Record<string, unknown>) {
  await writeFile(path.join(root, "svartz.config.ts"), `export default ${JSON.stringify({
    version: "1.0.0",
    vaults: [{
      id: "site",
      path: "vault",
      theme: path.join(workspaceRoot, "themes/minimal"),
      site: { title: "Guestbook" },
      plugins: [{ id: "guestbook", server: { module: path.join(root, "guestbook.mjs"), options: { database: { env: "DB" } } } }],
      ...vault,
    }],
  }, null, 2)};\n`);
}

/** Run `svartz dev` in `root` with `env` until `ready` answers, and return its origin and a function that stops it. */
async function startDev(
  root: string,
  ready: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ origin: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const dev = spawn(process.execPath, [
    cli, "dev", "--config", path.join(root, "svartz.config.ts"), "--host", "127.0.0.1", "--port", String(port),
  ], { cwd: root, env, stdio: "pipe" });
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

/** Sign the guestbook at `url` when `body` is given, and return what the plugin saw. */
async function guestbook(url: string, body?: string) {
  const response = await fetch(url, body === undefined ? {} : { method: "POST", body });
  expect(response.status, await response.clone().text()).toBe(200);
  return await response.json() as { entries: string[]; dotenv: unknown; vars: unknown; secret: unknown };
}

/** The entries `wrangler d1 execute --local` reads from the local D1 of the Wrangler config at `config`. */
async function localEntries(root: string, config = "wrangler.jsonc"): Promise<string[]> {
  const { stdout } = await execFileAsync(wranglerBin, [
    "d1", "execute", "DB", "--local", "--json", "--config", config, "--command", "SELECT body FROM entries ORDER BY id",
  ], { cwd: root, env: { ...process.env, CI: "1" } });
  const [result] = JSON.parse(stdout) as Array<{ results: Array<{ body: string }> }>;
  return result?.results.map((row) => row.body) ?? [];
}

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("hands a Node vault's plugins the project's .env and process env under svartz dev", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-dev-dotenv-")));
  roots.push(root);
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "vault/index.md"), "# Env\n");
  await writeFile(path.join(root, "probe.mjs"), `export default () => async (_request, context) => Response.json({
    dotenv: context.env.PRIVATE_DOTENV_TOKEN ?? null,
    process: context.env.PRIVATE_PROCESS_TOKEN ?? null,
  });\n`);
  // SvelteKit 3's `$env/dynamic/private` holds only declared variables, so `.env` reaches plugins through svartz dev.
  await writeFile(path.join(root, ".env"), "PRIVATE_DOTENV_TOKEN=from-dotenv\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default ${JSON.stringify({
    version: "1.0.0",
    vaults: [{
      id: "site",
      path: "vault",
      theme: path.join(workspaceRoot, "themes/minimal"),
      target: { type: "node" },
      site: { title: "Env" },
      plugins: [{ id: "probe", server: { module: path.join(root, "probe.mjs") } }],
    }],
  }, null, 2)};\n`);

  const dev = await startDev(root, "/", { ...process.env, PRIVATE_PROCESS_TOKEN: "from-process" });
  try {
    expect(await (await fetch(`${dev.origin}/_svartz/probe/`)).json()).toEqual({ dotenv: "from-dotenv", process: "from-process" });
  } finally {
    await dev.stop();
  }
}, DEV_TIMEOUT);

describe("svartz dev hands server plugins the vault's Wrangler bindings", () => {
  // A Workers vault's target is its Wrangler config; a Pages vault reads the project's.
  const targets = [
    ["cloudflare-workers", undefined, { type: "cloudflare-workers", ...GUESTBOOK_BINDINGS }, ".svartz/vaults/site/wrangler.json"],
    ["cloudflare-pages", { pages_build_output_dir: ".svelte-kit/cloudflare" }, { type: "cloudflare-pages" }, "wrangler.jsonc"],
  ] as const;

  for (const [type, wranglerConfig, target, config] of targets) {
    it(`persists a ${type} vault's D1 rows across restarts, where wrangler d1 execute --local reads them`, async () => {
      const root = await createProject("svartz-dev-bindings-", wranglerConfig);
      await writeConfig(root, { target });

      const first = await startDev(root, "/");
      try {
        expect(await guestbook(`${first.origin}/_svartz/guestbook/`, "first entry")).toEqual({
          entries: ["first entry"],
          dotenv: "from-dotenv",
          vars: "from-wrangler",
          secret: "from-dev-vars",
        });
      } finally {
        await first.stop();
      }

      const second = await startDev(root, "/");
      try {
        expect((await guestbook(`${second.origin}/_svartz/guestbook/`, "after restart")).entries)
          .toEqual(["first entry", "after restart"]);
      } finally {
        await second.stop();
      }

      expect(await localEntries(root, config)).toEqual(["first entry", "after restart"]);
    }, DEV_TIMEOUT);
  }

  it("serves a host vault the same D1 the host app's own routes read through adapter-cloudflare", async () => {
    const root = await createProject("svartz-dev-bindings-host-", { main: ".svelte-kit/cloudflare/_worker.js" });
    await symlink(kit2Toolchain, path.join(root, "node_modules"), "dir");
    await mkdir(path.join(root, "src/routes/[...slug]"), { recursive: true });
    await mkdir(path.join(root, "src/routes/count"), { recursive: true });
    for (const name of ["+page.svelte", "+page.ts", "+page.server.ts"]) {
      await writeFile(path.join(root, "src/routes/[...slug]", name),
        await readFile(path.join(workspaceRoot, "packages/cli/template/src/routes/[...slug]", name)));
    }
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "svartz-host-bindings", private: true, type: "module", devDependencies: { "@sveltejs/kit": "^2.0.0" } }));
    await writeFile(path.join(root, "vite.config.ts"), [
      "import { sveltekit } from '@sveltejs/kit/vite';",
      "import { defineConfig } from 'vite';",
      `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
      "export default withSvartzHost(defineConfig({ plugins: [sveltekit()] }));",
    ].join("\n"));
    await writeFile(path.join(root, "svelte.config.js"), "import adapter from '@sveltejs/adapter-cloudflare';\nexport default { kit: { adapter: adapter() } };\n");
    await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
    await writeFile(path.join(root, "src/hooks.server.ts"),
      "import { svartzHandle } from 'virtual:svartz/server';\nexport const handle = svartzHandle;\n");
    // A host route on adapter-cloudflare's own emulated platform, which must see the rows the plugin wrote.
    await writeFile(path.join(root, "src/routes/count/+server.ts"), [
      "export const GET = async ({ platform }) => {",
      "  const row = await platform.env.DB.prepare('SELECT count(*) AS count FROM entries').first();",
      "  return Response.json(row);",
      "};",
    ].join("\n"));
    await writeConfig(root, { mountPath: "/docs", target: { type: "host" } });

    const dev = await startDev(root, "/docs/");
    try {
      expect(await guestbook(`${dev.origin}/docs/_svartz/guestbook/`, "from a host")).toEqual({
        entries: ["from a host"],
        dotenv: "from-dotenv",
        vars: "from-wrangler",
        secret: "from-dev-vars",
      });
      expect(await (await fetch(`${dev.origin}/count`)).json()).toEqual({ count: 1 });
    } finally {
      await dev.stop();
    }

    expect(await localEntries(root)).toEqual(["from a host"]);
  }, DEV_TIMEOUT);
});

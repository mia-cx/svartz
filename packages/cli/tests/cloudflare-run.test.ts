import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBuild } from "./helpers/build-process";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(workspaceRoot, "packages/cli/dist/index.js");
const cliPackage = path.join(workspaceRoot, "packages/cli");
const wranglerBin = path.join(cliPackage, "node_modules/.bin/wrangler");
const BUILD_TIMEOUT = 240_000;
const HANDLER_MARKER = "svartz-hello-handler";
const roots: string[] = [];

interface DevWorker {
  readonly address: string;
  readonly port: number;
  stop(): Promise<void>;
}

// Wrangler's local runner: it bundles the worker from its own location, as a deploy does, and serves it in workerd.
const { unstable_dev } = (await import(
  pathToFileURL(createRequire(path.join(cliPackage, "package.json")).resolve("wrangler")).href
)) as { unstable_dev: (script: string, options: Record<string, unknown>) => Promise<DevWorker> };

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(name: string): Promise<string> {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), `svartz-cloudflare-${name}-`)));
  roots.push(root);
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "vault/index.md"), "# Home\n\nPrerendered welcome.\n");
  await writeFile(path.join(root, "vault/other.md"), "# Other\n\nLinked page.\n");
  await writeFile(path.join(root, "hello.mjs"), `export default () => (request, context) =>
    new URL(request.url).pathname === context.base + "/" ? Response.json({ marker: ${JSON.stringify(HANDLER_MARKER)} }) : undefined;\n`);
  return root;
}

async function writeConfig(root: string, vault: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(root, "svartz.config.ts"), `export default ${JSON.stringify({
    version: "1.0.0",
    vaults: [{
      id: "site",
      path: "vault",
      theme: path.join(workspaceRoot, "themes/minimal"),
      site: { title: "Cloudflare site" },
      plugins: [{ id: "hello", server: { module: path.join(root, "hello.mjs") } }],
      ...vault,
    }],
  })};\n`);
}

/** Bundle the worker `config` names as `wrangler deploy` does, short of the upload. */
async function bundle(config: string, outdir: string): Promise<void> {
  await execFileAsync(wranglerBin, ["deploy", "--dry-run", "--config", config, "--outdir", outdir], {
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

/**
 * Serve the worker in `directory` with that directory as its assets, and answer each request's status, content type
 * and body. `runWorkerFirst` routes requests as the deploy does: which go to the worker before a matching asset.
 */
async function serve(
  directory: string,
  runWorkerFirst: boolean | string[],
  requests: readonly [string, Record<string, string>?][],
) {
  vi.stubEnv("WRANGLER_SEND_METRICS", "false");
  const config = path.join(path.dirname(directory), "run-wrangler.json");
  await writeFile(config, JSON.stringify({
    name: "svartz-cloudflare-run",
    compatibility_date: "2026-03-03",
    compatibility_flags: ["nodejs_compat", "nodejs_als"],
    main: path.join(directory, "_worker.js"),
    assets: { binding: "ASSETS", directory, run_worker_first: runWorkerFirst },
  }));
  // `unstable_dev` waits forever on a worker that fails to bundle; a dry-run deploy reports it.
  await bundle(config, path.join(path.dirname(directory), "run-bundle"));
  const worker = await unstable_dev(path.join(directory, "_worker.js"), {
    config,
    ip: "127.0.0.1",
    logLevel: "error",
    experimental: { disableExperimentalWarning: true },
  });
  try {
    return await Promise.all(requests.map(async ([pathname, headers]) => {
      // The worker's own `fetch` loops on redirects; Markdown negotiation answers with one.
      const response = await fetch(`http://${worker.address}:${worker.port}${pathname}`, { headers });
      return [response.status, response.headers.get("content-type")?.split(";")[0], await response.text()];
    }));
  } finally {
    await worker.stop();
  }
}

describe("standalone Cloudflare builds", () => {
  it.each(["cloudflare-workers", "cloudflare-pages"])("serves a %s build in workerd", async (type) => {
    const root = await tempRoot(type);
    await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
    await writeConfig(root, { mountPath: "", target: { type } });
    await runBuild([cli, "build", "--config", path.join(root, "svartz.config.ts")], { cwd: root, timeout: BUILD_TIMEOUT - 30_000 });

    const vaultRoot = path.join(root, ".svartz/vaults/site");
    const output = path.join(vaultRoot, ".svelte-kit/cloudflare");
    // Workers run first, as the vault's generated Wrangler config says; Pages sends to its worker what `_routes.json` includes.
    const routes = type === "cloudflare-pages"
      ? JSON.parse(await readFile(path.join(output, "_routes.json"), "utf8")) as { include: string[]; exclude: string[] }
      : undefined;
    const runWorkerFirst = routes ? [...routes.include, ...routes.exclude.map((pattern) => `!${pattern}`)] : true;
    expect(await serve(output, runWorkerFirst, [
      ["/"],
      ["/_svartz/hello/"],
      ["/other/", { accept: "text/markdown" }],
    ])).toEqual([
      [200, "text/html", expect.stringContaining("Prerendered welcome.")],
      [200, "application/json", JSON.stringify({ marker: HANDLER_MARKER })],
      [200, "text/markdown", expect.stringContaining("Linked page.")],
    ]);
    // The deploy docs/server-plugins.md describes.
    if (type === "cloudflare-workers") await bundle(path.join(vaultRoot, "wrangler.json"), path.join(root, "deploy"));
  }, BUILD_TIMEOUT);

  // Proves one config deploys two sites: each vault gets its own Worker, domain, bindings and theme.
  it("builds two Workers vaults from one config, each its own Worker with its own theme", async () => {
    const root = await tempRoot("two-workers");
    await mkdir(path.join(root, "wplace"));
    await writeFile(path.join(root, "wplace/index.md"), "# Wplace\n\nUnofficial developer docs.\n");
    await writeFile(path.join(root, "svartz.config.ts"), `export default ${JSON.stringify({
      version: "1.0.0",
      vaults: [
        {
          id: "docs",
          path: "vault",
          theme: path.join(workspaceRoot, "themes/docs"),
          site: { title: "Docs" },
          target: { type: "cloudflare-workers", routes: [{ pattern: "docs.example.com", custom_domain: true }] },
        },
        {
          id: "wplace",
          path: "wplace",
          theme: path.join(workspaceRoot, "themes/wiki"),
          site: { title: "Wplace" },
          target: {
            type: "cloudflare-workers",
            name: "wplace-docs",
            routes: [{ pattern: "wplace.example.com", custom_domain: true }],
            d1_databases: [{ binding: "SVARTZ_DB", database_name: "wplace", database_id: "00000000-0000-0000-0000-000000000000" }],
          },
        },
      ],
    })};\n`);
    await runBuild([cli, "build", "--config", path.join(root, "svartz.config.ts")], { cwd: root, timeout: BUILD_TIMEOUT - 30_000 });

    const deployed = await Promise.all(["docs", "wplace"].map(async (id) => {
      const vaultRoot = path.join(root, ".svartz/vaults", id);
      const config = path.join(vaultRoot, "wrangler.json");
      await bundle(config, path.join(root, "deploy", id));
      return {
        wrangler: JSON.parse(await readFile(config, "utf8")) as Record<string, unknown>,
        page: await readFile(path.join(vaultRoot, ".svelte-kit/cloudflare/index.html"), "utf8"),
      };
    }));
    const [docs, wplace] = deployed;
    expect(docs!.wrangler).toMatchObject({ name: "docs", routes: [{ pattern: "docs.example.com", custom_domain: true }] });
    expect(docs!.wrangler).not.toHaveProperty("d1_databases");
    expect(wplace!.wrangler).toMatchObject({
      name: "wplace-docs",
      routes: [{ pattern: "wplace.example.com", custom_domain: true }],
      d1_databases: [{ binding: "SVARTZ_DB", database_name: "wplace" }],
    });
    // The docs theme frames pages in its `docs` layout; the wiki theme shows category pills.
    expect(docs!.page).toContain('class="docs ');
    expect(docs!.page).not.toContain("category-pills");
    expect(wplace!.page).toContain("category-pills");
    expect(wplace!.page).not.toContain('class="docs ');
  }, BUILD_TIMEOUT);
});

/** Link each package of a fixture toolchain into `root/node_modules` by its real path, as an install does. */
async function linkToolchain(root: string, fixture: string): Promise<void> {
  const toolchain = path.join(import.meta.dirname, "fixtures", fixture, "node_modules");
  const entries = (await readdir(toolchain, { withFileTypes: true })).filter((entry) => !entry.name.startsWith("."));
  for (const entry of entries) {
    const names = entry.name.startsWith("@")
      ? (await readdir(path.join(toolchain, entry.name))).map((name) => `${entry.name}/${name}`)
      : [entry.name];
    for (const name of names) {
      await mkdir(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
      await symlink(await realpath(path.join(toolchain, name)), path.join(root, "node_modules", name), "dir");
    }
  }
}

// `host-peers.mjs` needs `module.registerHooks`, new in Node 22.15; CI runs a newer Node.
describe.skipIf(!("registerHooks" in module))("host apps on adapter-cloudflare", () => {
  it.each([2, 3])("serves a SvelteKit %i host's build in workerd", async (kit) => {
    const root = await tempRoot(`kit${kit}-host`);
    await linkToolchain(root, `sveltekit-${kit}-host`);
    await writeFile(path.join(root, "package.json"), JSON.stringify({
      name: "svartz-cloudflare-host",
      private: true,
      type: "module",
      devDependencies: { "@sveltejs/kit": `^${kit}.0.0` },
    }));
    // SvelteKit 2 reads its config from svelte.config.js; SvelteKit 3 from the Vite plugin.
    const kitOptions = kit === 2 ? "" : "{ adapter: adapter() }";
    if (kit === 2) {
      await writeFile(path.join(root, "svelte.config.js"),
        "import adapter from '@sveltejs/adapter-cloudflare';\nexport default { kit: { adapter: adapter() } };\n");
    }
    await writeFile(path.join(root, "vite.config.js"), [
      "import adapter from '@sveltejs/adapter-cloudflare';",
      "import { sveltekit } from '@sveltejs/kit/vite';",
      "import { defineConfig } from 'vite';",
      `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
      `export default withSvartzHost(defineConfig({ plugins: [sveltekit(${kitOptions})] }));`,
    ].join("\n"));
    await writeFile(path.join(root, "wrangler.jsonc"), JSON.stringify({
      name: "svartz-cloudflare-host",
      compatibility_date: "2026-03-03",
      main: ".svelte-kit/cloudflare/_worker.js",
      assets: { binding: "ASSETS", directory: ".svelte-kit/cloudflare" },
    }));
    await mkdir(path.join(root, "src/routes"), { recursive: true });
    await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
    await writeFile(path.join(root, "src/hooks.server.js"), "export { svartzHandle as handle } from 'virtual:svartz/server';\n");
    await writeFile(path.join(root, "src/routes/+page.js"), "export const prerender = true;\n");
    await writeFile(path.join(root, "src/routes/+page.svelte"), "<h1>Prerendered welcome.</h1>\n");
    await writeConfig(root, { mountPath: "/docs", target: { type: "host" }, index: { markdown: true } });
    // Run as a published install runs: Svartz's peers resolve from the host.
    await runBuild([
      "--import", path.join(import.meta.dirname, "host-peers.mjs"), cli, "build", "--config", path.join(root, "svartz.config.ts"),
    ], { cwd: root, timeout: BUILD_TIMEOUT - 30_000 });

    // As the host's wrangler.jsonc leaves it: assets answer before the worker.
    expect(await serve(path.join(root, ".svelte-kit/cloudflare"), false, [
      ["/"],
      ["/docs/_svartz/hello/"],
      ["/docs/other/", { accept: "text/markdown" }],
    ])).toEqual([
      [200, "text/html", expect.stringContaining("Prerendered welcome.")],
      [200, "application/json", JSON.stringify({ marker: HANDLER_MARKER })],
      [200, "text/markdown", expect.stringContaining("Linked page.")],
    ]);
  }, BUILD_TIMEOUT);
});

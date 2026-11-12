import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import module from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
// SvelteKit 3, Vite 8, adapter-cloudflare 8 and `@svartz/ui`, pinned in the fixture package.
const toolchain = path.join(import.meta.dirname, "fixtures/sveltekit-3-host/node_modules");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Link each fixture package into `root/node_modules` by its real path. Svartz links each vault's build root to the
 * host's `node_modules`, and Tailwind's resolver misreads pnpm's relative links when reached through two symlinked
 * directories, so the host gets a real directory, as an install does.
 */
async function linkToolchain(root: string): Promise<void> {
  const packages = (await readdir(toolchain, { withFileTypes: true })).filter((entry) => !entry.name.startsWith("."));
  for (const entry of packages) {
    const names = entry.name.startsWith("@")
      ? (await readdir(path.join(toolchain, entry.name))).map((name) => `${entry.name}/${name}`)
      : [entry.name];
    for (const name of names) {
      await mkdir(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
      await symlink(await realpath(path.join(toolchain, name)), path.join(root, "node_modules", name), "dir");
    }
  }
}

/**
 * A SvelteKit 3 host on adapter-cloudflare under `paths.base` `/learn`, mounting the `course` vault at `/course`.
 * `routes` maps route files under `src/routes` to their source; `plugins` are the vault's Svartz plugins.
 */
async function createKit3Host(
  root: string,
  routes: Readonly<Record<string, string>>,
  plugins: readonly unknown[] = [],
): Promise<void> {
  await linkToolchain(root);
  await mkdir(path.join(root, "vault"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "svartz-kit3-host-fixture",
    private: true,
    type: "module",
    devDependencies: { "@sveltejs/kit": "^3.0.0" },
  }));
  // SvelteKit 3 reads its config from the Vite plugin; there is no svelte.config.js.
  await writeFile(path.join(root, "vite.config.js"), [
    "import adapter from '@sveltejs/adapter-cloudflare';",
    "import { sveltekit } from '@sveltejs/kit/vite';",
    "import { defineConfig } from 'vite';",
    `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
    "export default withSvartzHost(defineConfig({ plugins: [sveltekit({ adapter: adapter(), paths: { base: '/learn' } })] }));",
  ].join("\n"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  for (const [file, source] of Object.entries({ "+layout.js": "export const prerender = true;\n", ...routes })) {
    await mkdir(path.dirname(path.join(root, "src/routes", file)), { recursive: true });
    await writeFile(path.join(root, "src/routes", file), source);
  }
  await writeFile(path.join(root, "vault/intro.md"), "---\ntitle: Kit three lesson\n---\n# Kit three lesson\n\nLESSON_BODY_MARKER\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "course",
      path: "vault",
      mountPath: "/course",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: { type: "host" },
      index: { markdown: true },
      site: { title: "Course index" },
      plugins: ${JSON.stringify(plugins)},
    }],
  };\n`);
}

async function tempRoot(): Promise<string> {
  // SvelteKit writes relative imports from the kit dir; macOS's /var symlink would break them.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-kit3-host-")));
  roots.push(root);
  return root;
}

/** The CLI's arguments, run as a published install runs it: Vite and Svelte resolve from the host in `root`. */
function cliArgs(root: string, command: string, ...args: string[]): string[] {
  return [
    "--import", path.join(import.meta.dirname, "host-peers.mjs"),
    path.join(workspaceRoot, "packages/cli/dist/index.js"), command, "--config", path.join(root, "svartz.config.ts"), ...args,
  ];
}

async function build(root: string): Promise<void> {
  await execFileAsync(process.execPath, cliArgs(root, "build"), { cwd: root, maxBuffer: 4_000_000 });
}

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

// `host-peers.mjs` needs `module.registerHooks`, new in Node 22.15; CI runs a newer Node.
const kit3 = it.skipIf(!("registerHooks" in module));

kit3("prerenders a SvelteKit 3 host that reads the published index without compiling the page runtime", async () => {
  const root = await tempRoot();
  await createKit3Host(root, {
    "+page.svelte": [
      "<script>",
      "  import { vaults } from 'virtual:svartz/index';",
      "  const course = vaults.find((vault) => vault.id === 'course');",
      "</script>",
      "<h1>{course.siteConfig.title}</h1>",
      "<ul>{#each course.index.entries as entry}<li><a href={course.basePath + entry.markdownHref}>{entry.title}</a></li>{/each}</ul>",
    ].join("\n"),
  });
  await build(root);

  const output = path.join(root, ".svelte-kit/cloudflare");
  // The adapter ran on a server build, after prerendering.
  await readFile(path.join(output, "_worker.js"), "utf8");
  const home = await readFile(path.join(output, "learn/index.html"), "utf8");
  expect(home).toContain("Course index");
  expect(home).toContain('href="/learn/course/intro.md"');
  expect(await readFile(path.join(output, "learn/course/intro.md"), "utf8")).toContain("LESSON_BODY_MARKER");
  // Index-only hosts never compile the generated runtime (`createVaultView`) or a note page.
  for (const file of await filesUnder(path.join(root, ".svelte-kit/output"))) {
    expect(await readFile(file, "utf8"), file).not.toMatch(/createVaultView|prepareNoteArtifact/);
  }
}, 240_000);

kit3("prerenders a note page through the init catchall in a SvelteKit 3 host", async () => {
  const catchall = path.join(workspaceRoot, "packages/cli/template/src/routes/[...slug]");
  const routes: Record<string, string> = {};
  for (const name of await readdir(catchall)) routes[`[...slug]/${name}`] = await readFile(path.join(catchall, name), "utf8");
  const root = await tempRoot();
  await createKit3Host(root, routes);
  await build(root);

  // SvelteKit 3's default `trailingSlash: 'never'` writes `intro.html`.
  const page = await readFile(path.join(root, ".svelte-kit/cloudflare/learn/course/intro.html"), "utf8");
  expect(page).toContain("LESSON_BODY_MARKER");
  // The catchall links the theme's stylesheets under SvelteKit's `paths.base`.
  expect(page).toMatch(/<link rel="stylesheet" href="\/learn\/_app\/immutable\/assets\/runtime-theme\.[^"]+\.css"/);
}, 240_000);

kit3("serves a SvelteKit 3 host's server plugins the Wrangler bindings its adapter-cloudflare reads in dev", async () => {
  const root = await tempRoot();
  await createKit3Host(root, { "+page.svelte": "<h1>Host home</h1>\n" }, [
    { id: "probe", server: { module: path.join(root, "probe.mjs") } },
  ]);
  await writeFile(path.join(root, "src/hooks.server.js"),
    "import { svartzHandle } from 'virtual:svartz/server';\nexport const handle = svartzHandle;\n");
  await writeFile(path.join(root, "probe.mjs"),
    "export default () => async (_request, context) => Response.json({ db: context.env.DB ?? null });\n");
  // Svartz reads bindings through wrangler's getPlatformProxy; this one answers without starting workerd.
  await writeFile(path.join(root, "wrangler.json"), "{}\n");
  await rm(path.join(root, "node_modules/wrangler"));
  await mkdir(path.join(root, "node_modules/wrangler"));
  await writeFile(path.join(root, "node_modules/wrangler/package.json"), JSON.stringify({ name: "wrangler", type: "module", main: "index.js" }));
  await writeFile(path.join(root, "node_modules/wrangler/index.js"),
    "export const getPlatformProxy = async () => ({ env: { DB: 'from-wrangler' }, dispose: async () => {} });\n");

  const port = await freePort();
  const dev = spawn(process.execPath, cliArgs(root, "dev", "--host", "127.0.0.1", "--port", String(port)), { cwd: root, stdio: "pipe" });
  let output = "";
  dev.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  dev.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  try {
    const probe = `http://127.0.0.1:${port}/learn/course/_svartz/probe/`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 1_200 && !response?.ok; attempt++) {
      if (dev.exitCode !== null) throw new Error(`svartz dev exited:\n${output}`);
      response = await fetch(probe).catch(() => undefined);
      if (!response?.ok) await sleep(100);
    }
    expect(response?.ok, output).toBe(true);
    expect(await response!.json()).toEqual({ db: "from-wrangler" });
  } finally {
    dev.kill("SIGTERM");
    if (dev.exitCode === null) await once(dev, "exit");
  }
}, 240_000);

import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const roots: string[] = [];

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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("builds and serves a vault inside an existing host without replacing host files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-host-build-"));
  roots.push(root);
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "node_modules"), "dir");
  await mkdir(path.join(root, "src/routes/other"), { recursive: true });
  await mkdir(path.join(root, "vault"));
  await mkdir(path.join(root, ".svelte-kit"));

  const packageJson = JSON.stringify({
    name: "svartz-host-fixture",
    private: true,
    type: "module",
    scripts: { build: "vite build", dev: "vite dev" },
    devDependencies: { "@sveltejs/kit": "^2.0.0" },
  }, null, 2);
  const viteConfig = [
    "import { sveltekit } from '@sveltejs/kit/vite';",
    "import { defineConfig } from 'vite';",
    "export default defineConfig({ plugins: [sveltekit()] });",
  ].join("\n");
  const svelteConfig = "import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter() } };\n";
  await writeFile(path.join(root, "package.json"), packageJson);
  await writeFile(path.join(root, "vite.config.ts"), viteConfig);
  await writeFile(path.join(root, "svelte.config.js"), svelteConfig);
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body data-sveltekit-preload-data=\"hover\"><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  await writeFile(path.join(root, ".svelte-kit/keep"), "host state");
  await writeFile(path.join(root, "src/routes/+page.svelte"), "<h1>Host home</h1>\n");
  await writeFile(path.join(root, "src/routes/other/+page.svelte"), "<h1>Other route</h1>\n");
  await writeFile(path.join(root, "vault/index.md"), "# Published note\n\nVault content.\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "notes",
      path: "vault",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: { type: "host" },
      site: { title: "Notes", url: "https://example.test" },
    }],
  };\n`);

  await execFileAsync(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"),
    "build",
    "--config",
    path.join(root, "svartz.config.ts"),
  ], { cwd: root, maxBuffer: 4_000_000 });

  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(packageJson);
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(viteConfig);
  expect(await readFile(path.join(root, "svelte.config.js"), "utf8")).toBe(svelteConfig);
  expect(await readFile(path.join(root, ".svelte-kit/keep"), "utf8")).toBe("host state");
  await expect(access(path.join(root, "turbo.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await access(path.join(root, "build/index.js"));
  await access(path.join(root, ".svelte-kit/output/server/entries/pages/other/_page.svelte.js"));
  expect(await readFile(path.join(root, ".svartz/vaults/notes/artifacts/pages/index.svelte"), "utf8"))
    .toContain("Published note");

  const port = await freePort();
  const dev = spawn(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"),
    "dev:runner",
    "--config",
    path.join(root, "svartz.config.ts"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ], { cwd: root, stdio: "pipe" });
  let stderr = "";
  dev.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (dev.exitCode !== null) throw new Error(`Host dev server exited: ${stderr}`);
      try {
        response = await fetch(`http://127.0.0.1:${port}/other`);
        break;
      } catch {
        await sleep(100);
      }
    }
    expect(response, stderr).toBeDefined();
    expect(response?.status, stderr).toBe(200);
    expect(await response?.text()).toContain("Other route");
  } finally {
    dev.kill("SIGTERM");
    if (dev.exitCode === null) await once(dev, "exit");
  }
}, 20_000);

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

it("builds and serves two isolated vaults inside one existing host", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svartz-host-build-"));
  roots.push(root);
  await symlink(path.join(workspaceRoot, "apps/web/node_modules"), path.join(root, "node_modules"), "dir");
  await mkdir(path.join(root, "src/routes/other"), { recursive: true });
  await mkdir(path.join(root, "src/routes/blog/about"), { recursive: true });
  await mkdir(path.join(root, "src/routes/blog/folders/guides/deep"), { recursive: true });
  await mkdir(path.join(root, "src/routes/rss.xml"), { recursive: true });
  await mkdir(path.join(root, "src/routes/[...slug]"), { recursive: true });
  await mkdir(path.join(root, "vault"));
  await mkdir(path.join(root, "vault/guides/deep"), { recursive: true });
  await mkdir(path.join(root, "work-vault"));
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
    `import { withSvartzHost } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/host.js"))};`,
    "export default withSvartzHost(defineConfig({ plugins: [sveltekit()] }));",
  ].join("\n");
  const svelteConfig = "import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter() } };\n";
  await writeFile(path.join(root, "package.json"), packageJson);
  await writeFile(path.join(root, "vite.config.ts"), viteConfig);
  await writeFile(path.join(root, "svelte.config.js"), svelteConfig);
  await writeFile(path.join(root, "src/app.html"), "<!doctype html><html lang=\"en\"><head>%sveltekit.head%</head><body data-sveltekit-preload-data=\"hover\"><div style=\"display: contents\">%sveltekit.body%</div></body></html>\n");
  await writeFile(path.join(root, ".svelte-kit/keep"), "host state");
  await writeFile(path.join(root, "src/routes/+page.svelte"), "<h1>Host home</h1>\n");
  await writeFile(path.join(root, "src/routes/other/+page.svelte"), "<h1>Other route</h1>\n");
  await writeFile(path.join(root, "src/routes/blog/about/+page.svelte"), "<h1>Manual about</h1>\n");
  await writeFile(path.join(root, "src/routes/blog/folders/guides/deep/+page.svelte"), "<h1>Manual deep listing</h1>\n");
  await writeFile(path.join(root, "src/routes/rss.xml/+server.ts"), [
    "import { vaults } from 'virtual:svartz/host';",
    `import { renderHostRss } from ${JSON.stringify(path.join(workspaceRoot, "packages/vite/dist/discovery.js"))};`,
    "export const prerender = true;",
    "export const GET = () => new Response(renderHostRss(vaults, ['notes', 'work'], { title: 'Combined', url: 'https://example.test' }), { headers: { 'content-type': 'application/rss+xml' } });",
  ].join("\n"));
  for (const name of ["+page.svelte", "+page.ts"]) {
    await writeFile(path.join(root, "src/routes/[...slug]", name),
      await readFile(path.join(workspaceRoot, "packages/cli/template/src/routes/[...slug]", name)));
  }
  await writeFile(path.join(root, "vault/index.md"), "# Published note\n\nVault content. ![](shared.png)\n");
  await writeFile(path.join(root, "vault/shared.png"), "blog asset");
  await writeFile(path.join(root, "work-vault/index.md"), "# Work landing\n\nWork content. ![](shared.png)\n");
  await writeFile(path.join(root, "work-vault/shared.png"), "work asset");
  await writeFile(path.join(root, "work-vault/private.md"), "---\nprivate: true\n---\n# Secret project\n");
  await writeFile(path.join(root, "vault/about.md"), "---\naliases: [about-alt]\nsocialImage: shared.png\n---\n# Vault about\n\nVault about body.\n");
  await writeFile(path.join(root, "vault/guides/index.md"), "---\ntitle: Guides landing\ntags: [guides]\n---\n# Guides landing\n");
  await writeFile(path.join(root, "vault/guides/deep/one.md"), "---\ntitle: Deep guide\ntags: [guides]\n---\n# Deep guide\n");
  await writeFile(path.join(root, "vault/guides/deep/private.md"), "---\nprivate: true\ntags: [guides]\n---\n# Hidden guide\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    vaults: [{
      id: "notes",
      path: "vault",
      mountPath: "/blog",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: { type: "host" },
      site: { title: "Notes", url: "https://example.test" },
    }, {
      id: "work",
      path: "work-vault",
      mountPath: "/work",
      theme: ${JSON.stringify(path.join(workspaceRoot, "themes/minimal"))},
      target: { type: "host" },
      site: { title: "Work", url: "https://example.test" },
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
  expect(await readFile(path.join(root, "build/client/blog/shared.png"), "utf8")).toBe("blog asset");
  expect(await readFile(path.join(root, "build/client/work/shared.png"), "utf8")).toBe("work asset");
  await access(path.join(root, "build/client/blog/__svartz/social/index.png"));
  await access(path.join(root, "build/client/work/__svartz/social/index.png"));
  await expect(access(path.join(root, "build/client/blog/__svartz/social/about-2.png")))
    .rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/work/__svartz/social/private.png")))
    .rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/blog/__svartz/favicon-32.png")))
    .rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, "build/client/blog/rss.xml"), "utf8"))
    .toContain("https://example.test/blog/about-2/");
  expect(await readFile(path.join(root, "build/client/work/sitemap.xml"), "utf8"))
    .toContain("https://example.test/work/");
  await access(path.join(root, ".svelte-kit/output/server/entries/pages/other/_page.svelte.js"));
  expect(await readFile(path.join(root, ".svartz/vaults/notes/artifacts/pages/index.svelte"), "utf8"))
    .toContain("Published note");
  expect(await readFile(path.join(root, ".svartz/vaults/notes/artifacts/pages/about-2.svelte"), "utf8"))
    .toContain("Vault about body");
  const notesIndex = await readFile(path.join(root, ".svartz/vaults/notes/artifacts/index.ts"), "utf8");
  expect(notesIndex).toContain('"slug": "guides", "title": "Guides", "noteCount": 2');
  expect(notesIndex).toContain('"slug": "guides/deep", "title": "Deep", "noteCount": 1');
  expect(notesIndex).toContain('"slug": "guides", "title": "guides", "noteCount": 2');
  expect(notesIndex).not.toContain("Hidden guide");
  expect(await readFile(path.join(root, ".svartz/vaults/work/artifacts/pages/index.svelte"), "utf8"))
    .toContain("Work content");
  await expect(access(path.join(root, ".svartz/vaults/work/artifacts/pages/private.svelte")))
    .rejects.toMatchObject({ code: "ENOENT" });

  const port = await freePort();
  const dev = spawn(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"),
    "dev:runner",
    "--config",
    path.join(root, "svartz.config.ts"),
    "--vault",
    "notes",
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
    const manual = await fetch(`http://127.0.0.1:${port}/blog/about`);
    expect(await manual.text()).toContain("Manual about");
    const folder = await fetch(`http://127.0.0.1:${port}/blog/folders/guides`);
    expect(await folder.text()).toContain("Deep guide");
    const manualFolder = await fetch(`http://127.0.0.1:${port}/blog/folders/guides/deep`);
    expect(await manualFolder.text()).toContain("Manual deep listing");
    const tag = await fetch(`http://127.0.0.1:${port}/blog/tags/guides`);
    const tagBody = await tag.text();
    expect(tagBody).toContain("Deep guide");
    expect(tagBody).not.toContain("Hidden guide");
    const authoredFolder = await fetch(`http://127.0.0.1:${port}/blog/guides`);
    expect(await authoredFolder.text()).toContain("Guides landing");
    const vault = await fetch(`http://127.0.0.1:${port}/blog/about-2`);
    const vaultBody = await vault.text();
    expect(vault.status, `${stderr}\n${vaultBody}`).toBe(200);
    expect(vaultBody).toContain("Vault about body");
    expect(vaultBody).toContain('property="og:image" content="https://example.test/blog/shared.png"');
    const blogHome = await fetch(`http://127.0.0.1:${port}/blog/`);
    const blogBody = await blogHome.text();
    expect(blogBody).toContain("Vault content");
    expect(blogBody).toContain("Index | Notes");
    expect(blogBody).toContain('property="og:image" content="https://example.test/blog/__svartz/social/index.png"');
    expect((await fetch(`http://127.0.0.1:${port}/blog/__svartz/social/index.png`)).status).toBe(200);
    const workHome = await fetch(`http://127.0.0.1:${port}/work/`);
    const workBody = await workHome.text();
    expect(workHome.status, `${stderr}\n${workBody}`).toBe(200);
    expect(workBody).toContain("Work content");
    expect(workBody).toContain("Index | Work");
    expect(workBody).not.toContain("Vault content");
    expect(await (await fetch(`http://127.0.0.1:${port}/blog/shared.png`)).text()).toBe("blog asset");
    expect(await (await fetch(`http://127.0.0.1:${port}/work/shared.png`)).text()).toBe("work asset");
    const combinedFeed = await (await fetch(`http://127.0.0.1:${port}/rss.xml`)).text();
    expect(combinedFeed).toContain("https://example.test/blog/");
    expect(combinedFeed).toContain("https://example.test/work/");
    expect(combinedFeed).not.toContain("Secret project");
    expect((await fetch(`http://127.0.0.1:${port}/work/private`)).status).toBe(404);
    const alias = await fetch(`http://127.0.0.1:${port}/blog/about-alt`, { redirect: "manual" });
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("/blog/about-2/");
    expect((await fetch(`http://127.0.0.1:${port}/blog/missing`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/outside`)).status).toBe(404);
  } finally {
    dev.kill("SIGTERM");
    if (dev.exitCode === null) await once(dev, "exit");
  }

  const configPath = path.join(root, "svartz.config.ts");
  const configSource = await readFile(configPath, "utf8");
  await rm(path.join(root, "vault/guides/deep/one.md"));
  await writeFile(configPath, configSource.replace('id: "notes",',
    'id: "notes", discovery: { feed: { enabled: false }, sitemap: { enabled: false }, socialImages: { enabled: false }, favicon: { enabled: true } },'));
  await execFileAsync(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"), "build", "--config", configPath,
  ], { cwd: root, maxBuffer: 4_000_000 });
  await expect(access(path.join(root, "build/client/blog/rss.xml"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/blog/sitemap.xml"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/blog/__svartz/social/index.png")))
    .rejects.toMatchObject({ code: "ENOENT" });
  await access(path.join(root, "build/client/blog/__svartz/favicon-32.png"));
  await access(path.join(root, "build/client/work/rss.xml"));
  await expect(access(path.join(root, ".svartz/vaults/notes/artifacts/pages/guides/deep/one.svelte")))
    .rejects.toMatchObject({ code: "ENOENT" });
  const rebuiltIndex = await readFile(path.join(root, ".svartz/vaults/notes/artifacts/index.ts"), "utf8");
  expect(rebuiltIndex).not.toContain('"slug": "guides/deep", "title": "Deep"');
  expect(rebuiltIndex).not.toContain('"/blog/folders/guides/deep/"');
}, 30_000);

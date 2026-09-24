import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope } from "@svartz/core";

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
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("builds and serves two isolated vaults inside one existing host", async () => {
  vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "host-test-password");
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
  await mkdir(path.join(root, "src/lib"));
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
  await writeFile(path.join(root, "src/lib/context-key.ts"), 'export const hostKey = Symbol("host-context");\n');
  await writeFile(path.join(root, "src/routes/+layout.svelte"), '<script>import { setContext } from "svelte"; import { goto } from "$app/navigation"; import { hostKey } from "$lib/context-key"; setContext(hostKey, "shared host");</script><button onclick={() => goto("/work/")}>Host navigate</button><slot />\n');
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
  await writeFile(path.join(root, "work-vault/Counter.svelte"), '<script>let count = $state(0);</script><button onclick={() => count++}>Count: {count}</button>\n');
  await writeFile(path.join(root, "work-vault/private.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>HOST_ASSET_MARKER</title><circle cx="5" cy="5" r="4" /></svg>');
  await writeFile(path.join(root, "work-vault/secret.svx"), "---\ntitle: Locked work\npassword_group: friends\n---\n<script>import { getContext } from 'svelte'; import { page } from '$app/state'; import { hostKey } from '$lib/context-key'; import Counter from './Counter.svelte';</script><h1>HOST_PROTECTED_MARKER</h1><p class='protected-tone'>sapphire</p><p>Context: {getContext(hostKey)}</p><p>Route: {page.url.pathname}</p><Counter /><img src='./private.svg' alt='Secret diagram' /><style>.protected-tone { color: rgb(1, 2, 3); }</style>\n");
  await writeFile(path.join(root, "vault/about.md"), "---\naliases: [about-alt]\nsocialImage: shared.png\n---\n# Vault about\n\nVault about body. #portfolio\n");
  await writeFile(path.join(root, "vault/guides/index.md"), "---\ntitle: Guides landing\ntags: [guides]\n---\n# Guides landing\n");
  await writeFile(path.join(root, "vault/guides/deep/one.md"), "---\ntitle: Deep guide\ntags: [guides]\n---\n# Deep guide\n");
  await writeFile(path.join(root, "vault/guides/deep/private.md"), "---\nprivate: true\ntags: [guides]\n---\n# Hidden guide\n");
  await writeFile(path.join(root, "svartz.config.ts"), `export default {
    version: "1.0.0",
    passwordGroups: { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } },
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
  const protectedFiles = await readdir(path.join(root, "build/client/work/__svartz/protected"));
  const envelopes = protectedFiles.filter((name) => name.endsWith(".json"));
  expect(envelopes).toHaveLength(1);
  const sealed = await readFile(path.join(root, "build/client/work/__svartz/protected", envelopes[0]!), "utf8");
  expect(sealed).not.toContain("HOST_PROTECTED_MARKER");
  const envelope = JSON.parse(sealed) as ProtectedEnvelope;
  const key = await deriveProtectionKey("host-test-password", envelope.salt);
  const protectedPayload = JSON.parse(new TextDecoder().decode(await openProtectedPayload(key, envelope, envelope.id)));
  expect(protectedPayload.css).toContain("protected-tone");
  await expect(access(path.join(root, "build/client/work/private.svg"))).rejects.toMatchObject({ code: "ENOENT" });
  for (const directory of [path.join(root, "build"), path.join(root, ".svartz/vaults/work/artifacts"), path.join(root, ".svelte-kit/output")]) {
    for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      expect((await readFile(path.join(file.parentPath, file.name))).toString("utf8"))
        .not.toMatch(/HOST_PROTECTED_MARKER|HOST_ASSET_MARKER/);
    }
  }
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
    const locked = await fetch(`http://127.0.0.1:${port}/work/secret`);
    const lockedHtml = await locked.text();
    expect(locked.status).toBe(200);
    expect(lockedHtml).toContain("Unlock note");
    expect(lockedHtml).not.toContain("HOST_PROTECTED_MARKER");
    const builtPort = await freePort();
    const browserPort = await freePort();
    const chromiumProcess = spawn(chromium.executablePath(), [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${path.join(root, "chromium-profile")}`,
    ], { stdio: "ignore" });
    let built: ReturnType<typeof spawn> | undefined;
    try {
      built = spawn(process.execPath, [path.join(root, "build/index.js")], {
        cwd: root,
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(builtPort) },
        stdio: "pipe",
      });
      let builtReady = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          builtReady = (await fetch(`http://127.0.0.1:${builtPort}/work/secret`)).status === 200;
          if (builtReady) break;
        } catch {
          if (built.exitCode !== null) throw new Error("Built host exited before serving protected notes");
          await sleep(100);
        }
      }
      if (!builtReady) throw new Error("Built host did not become ready");
      let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
          break;
        } catch {
          if (chromiumProcess.exitCode !== null) throw new Error("Chromium exited before CDP was ready");
          await sleep(100);
        }
      }
      if (!browser) throw new Error("Chromium CDP did not become ready");
      try {
        const context = browser.contexts()[0]!;
        const page = await context.newPage();
        const browserErrors: string[] = [];
        const navigations: string[] = [];
        page.on("pageerror", (error) => browserErrors.push(error.message));
        page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
        page.on("console", (message) => browserErrors.push(message.text()));
        page.on("response", (response) => { if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`); });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
        await page.goto(`http://127.0.0.1:${builtPort}/work/secret`);
        await sleep(1_000);
        await page.getByRole("button", { name: "Open search (Ctrl+K)" }).click();
        await page.getByRole("searchbox", { name: "Search notes" }).fill("sapphire");
        await page.getByText("No results found.").waitFor();
        await page.getByRole("button", { name: "Close search" }).click();
        await page.getByLabel("Password").fill("wrong-password");
        await page.getByRole("button", { name: "Unlock note" }).click();
        await page.getByRole("alert").waitFor({ timeout: 5_000 }).catch(async () => {
          throw new Error(`Unlock alert missing: ${JSON.stringify({ browserErrors, navigations, url: page.url(), form: await page.evaluate(() => ({ handler: typeof document.querySelector('form')?.onsubmit, value: (document.querySelector('input[type=password]') as HTMLInputElement)?.value })), resources: await page.evaluate(() => performance.getEntriesByType("resource").map((item) => item.name).slice(-12)), body: (await page.locator("body").innerText()).slice(-2000) })}`);
        });
        expect(await page.getByText("HOST_PROTECTED_MARKER").count()).toBe(0);
        await page.getByLabel("Password").fill("host-test-password");
        await page.getByRole("button", { name: "Unlock note" }).click();
        await page.getByText("HOST_PROTECTED_MARKER").waitFor({ timeout: 15_000 });
        await page.waitForFunction(() => {
          const element = document.querySelector(".protected-tone");
          return element && getComputedStyle(element).color === "rgb(1, 2, 3)";
        }, undefined, { timeout: 5_000 }).catch(async () => {
          throw new Error(`Protected CSS missing: ${JSON.stringify({ browserErrors, inspection: await page.evaluate(() => ({
            element: document.querySelector('.protected-tone')?.outerHTML,
            color: getComputedStyle(document.querySelector('.protected-tone')!).color,
            styles: [...document.querySelectorAll('style')].map((style) => style.textContent?.slice(0, 300)).filter((style) => style?.includes('protected-tone')),
            allStyles: document.querySelectorAll('style').length,
          })) })}`);
        });
        await page.getByRole("button", { name: "Open search (Ctrl+K)" }).click();
        await page.getByRole("searchbox", { name: "Search notes" }).fill("sapphire");
        await page.getByRole("option", { name: "Locked work" }).waitFor();
        await page.getByRole("button", { name: "Close search" }).click();
        const privateImage = page.getByRole("img", { name: "Secret diagram" });
        await privateImage.waitFor();
        expect(await privateImage.getAttribute("src")).toMatch(/^blob:/);
        expect(await privateImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        expect(await page.getByText("Context: shared host").count()).toBe(1);
        expect(await page.getByText("Route: /work/secret").count()).toBe(1);
        await page.getByRole("button", { name: "Count: 0" }).click();
        expect(await page.getByRole("button", { name: "Count: 1" }).count()).toBe(1);
        await page.getByRole("button", { name: "Host navigate" }).click();
        await page.waitForURL(/\/work\/?$/);
        await page.goBack();
        await page.getByText("HOST_PROTECTED_MARKER").waitFor({ timeout: 5_000 }).catch(async () => {
          throw new Error(`Protected note did not remount: ${JSON.stringify({ url: page.url(), navigations, browserErrors, body: (await page.locator("body").innerText()).slice(-1000) })}`);
        });
        expect(await page.getByRole("button", { name: "Count: 0" }).count()).toBe(1);
        await page.getByRole("button", { name: "Lock note" }).click();
        expect(await page.getByText("HOST_PROTECTED_MARKER").count()).toBe(0);
        await page.getByLabel("Password").waitFor();
        await page.getByRole("button", { name: "Open search (Ctrl+K)" }).click();
        await page.getByRole("searchbox", { name: "Search notes" }).fill("sapphire");
        await page.getByText("No results found.").waitFor();
        await page.getByRole("button", { name: "Close search" }).click();
        await cdp.detach();
        await page.close();
      } finally {
        await browser.close();
      }
    } finally {
      chromiumProcess.kill("SIGTERM");
      if (chromiumProcess.exitCode === null) await once(chromiumProcess, "exit");
      built?.kill("SIGTERM");
      if (built?.exitCode === null) await once(built, "exit");
    }
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
    expect(vaultBody).toContain('href="../tags/portfolio/"');
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
  await rm(path.join(root, "work-vault/secret.svx"));
  await writeFile(configPath, configSource.replace('id: "notes",',
    'id: "notes", discovery: { feed: { enabled: false }, sitemap: { enabled: false }, socialImages: { enabled: false }, favicon: { enabled: true } },'));
  await execFileAsync(process.execPath, [
    path.join(workspaceRoot, "packages/cli/dist/index.js"), "build", "--config", configPath,
  ], { cwd: root, maxBuffer: 4_000_000 });
  await expect(access(path.join(root, "build/client/blog/rss.xml"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/blog/sitemap.xml"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/blog/__svartz/social/index.png")))
    .rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(root, "build/client/work/__svartz/protected")))
    .rejects.toMatchObject({ code: "ENOENT" });
  await access(path.join(root, "build/client/blog/__svartz/favicon-32.png"));
  await access(path.join(root, "build/client/work/rss.xml"));
  await expect(access(path.join(root, ".svartz/vaults/notes/artifacts/pages/guides/deep/one.svelte")))
    .rejects.toMatchObject({ code: "ENOENT" });
  const rebuiltIndex = await readFile(path.join(root, ".svartz/vaults/notes/artifacts/index.ts"), "utf8");
  expect(rebuiltIndex).not.toContain('"slug": "guides/deep", "title": "Deep"');
  expect(rebuiltIndex).not.toContain('"/blog/folders/guides/deep/"');
}, 90_000);

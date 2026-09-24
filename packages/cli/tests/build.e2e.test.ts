import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import os from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope, type ProtectedGroupPayload } from "@svartz/core";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIST_ROOT = resolve(ROOT, ".svartz/vaults/docs/dist");
const DIST_INDEX_PATH = resolve(DIST_ROOT, "index.html");
const DIST_NOT_FOUND_PATH = resolve(DIST_ROOT, "404.html");
const DIST_SITEMAP_PATH = resolve(DIST_ROOT, "sitemap.xml");

async function run(command: string, args: string[]) {
  await execFileAsync(command, args, {
    cwd: ROOT,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function pnpm(args: string[]) {
  await run("corepack", ["pnpm", ...args]);
}

describe("svartz CLI", () => {
  beforeAll(
    async () => {
      await pnpm(["--filter", "@svartz/core", "build"]);
      await pnpm(["--filter", "@svartz/config", "build"]);
      await pnpm(["--filter", "@svartz/plugins", "build"]);
      await pnpm(["--filter", "@svartz/vite", "build"]);
      await pnpm(["--filter", "svartz", "build"]);
    },
    240_000,
  );

  it(
    "builds prerendered docs from a clean output directory",
    async () => {
      await rm(DIST_ROOT, { recursive: true, force: true });

      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--vault", "docs"]);

      await expect(access(DIST_INDEX_PATH)).resolves.toBeUndefined();
      await expect(access(DIST_NOT_FOUND_PATH)).resolves.toBeUndefined();
      await expect(access(DIST_SITEMAP_PATH)).rejects.toMatchObject({ code: "ENOENT" });
      const guides = await readFile(resolve(DIST_ROOT, "folders/guides/index.html"), "utf8");
      expect(guides).toContain("Create Plugin");
      const utilities = await readFile(resolve(DIST_ROOT, "folders/plugins/utilities/index.html"), "utf8");
      expect(utilities).toContain("parse");
      const tag = await readFile(resolve(DIST_ROOT, "tags/guides/index.html"), "utf8");
      expect(tag).toContain("Create Plugin");

      const html = await readFile(DIST_INDEX_PATH, "utf8");
      expect(html).toContain("<title>");
      expect(html).toContain("data:image/png;base64,");
      expect(html).toContain("<h1");
      expect(html).not.toContain('aria-live="polite">Loading');
    },
    240_000,
  );

  it("builds social images and favicon variants for a static vault", async () => {
    const configPath = resolve(ROOT, ".svartz-images-e2e.config.ts");
    try {
      await writeFile(configPath, `export default {
        version: "1.0.0",
        vaults: [{ id: "docs", path: "vaults/docs",
          target: { type: "static", basePath: "/site" }, site: { title: "Docs", url: "https://example.test/site" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
      await access(resolve(DIST_ROOT, "__svartz/social/index.png"));
      await access(resolve(DIST_ROOT, "__svartz/favicon.svg"));
      await access(resolve(DIST_ROOT, "__svartz/favicon-32.png"));
      await access(resolve(DIST_ROOT, "__svartz/apple-touch-icon.png"));
      await access(DIST_NOT_FOUND_PATH);
      await access(resolve(ROOT, ".svartz/vaults/docs/artifacts/runtime-theme.ts"));
      await access(resolve(ROOT, ".svartz/vaults/docs/artifacts/runtime-artifacts.ts"));
      const html = await readFile(resolve(DIST_ROOT, "index.html"), "utf8");
      expect(html).toContain("https://example.test/site/__svartz/social/index.png");
      expect(html).toContain('<link rel="canonical" href="https://example.test/site/"');
      expect(html).toContain('property="og:url" content="https://example.test/site/"');
      expect(html).toContain('href="https://example.test/site/__svartz/favicon.svg"');
      expect(html).not.toContain("/site/site/");
      expect(html).toContain('property="og:title"');
      expect(html).toContain("Svartz Documentation Vault");
      const noteHtml = await readFile(resolve(DIST_ROOT, "guides/create-plugin/index.html"), "utf8");
      expect(noteHtml).toContain('<link rel="canonical" href="https://example.test/site/guides/create-plugin/"');
      expect(noteHtml).toContain('property="og:image" content="https://example.test/site/__svartz/social/guides/create-plugin.png"');
      expect(noteHtml).not.toContain("/site/site/");
      const sitemap = await readFile(DIST_SITEMAP_PATH, "utf8");
      expect(sitemap).toContain("<loc>https://example.test/site/</loc>");
      expect(sitemap).toContain("<loc>https://example.test/site/tags/guides/</loc>");
      expect(sitemap).not.toContain("404.html");
    } finally {
      await rm(configPath, { force: true });
    }
  }, 240_000);

  it("renders a mounted static vault below a standalone deployment base", async () => {
    const configPath = resolve(ROOT, ".svartz-mounted-base-e2e.config.ts");
    try {
      await writeFile(configPath, `export default {
        version: "1.0.0",
        vaults: [{ id: "docs", path: "vaults/docs", mountPath: "/blog",
          target: { type: "static", basePath: "/site" }, site: { title: "Docs", url: "https://example.test/site" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
      const html = await readFile(resolve(DIST_ROOT, "blog/index.html"), "utf8");
      expect(html).toContain("Svartz Documentation Vault");
      expect(html).toContain('href="https://example.test/site/blog/"');
      const registry = await readFile(resolve(ROOT, ".svartz/host/runtime.ts"), "utf8");
      expect(registry).toContain('basePath: "/site"');
    } finally {
      await rm(configPath, { force: true });
    }
  }, 240_000);

  it("publishes protected SVX as sealed static output only", async () => {
    const configPath = resolve(ROOT, ".svartz-protected-e2e.config.ts");
    const dist = resolve(ROOT, ".svartz/vaults/protected-e2e/dist");
    const packageSource = await readFile(resolve(ROOT, "package.json"), "utf8");
    const turboSource = await readFile(resolve(ROOT, "turbo.json"), "utf8");
    const previousPassword = process.env.SVARTZ_TEST_PROTECTED_PASSWORD;
    const previousSecondPassword = process.env.SVARTZ_TEST_SECOND_PASSWORD;
    process.env.SVARTZ_TEST_PROTECTED_PASSWORD = "e2e-only-password";
    process.env.SVARTZ_TEST_SECOND_PASSWORD = "second-e2e-password";
    try {
      await writeFile(configPath, `export default {
        version: "1.0.0",
        passwordGroups: { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" }, family: { env: "SVARTZ_TEST_SECOND_PASSWORD" } },
        vaults: [{ id: "protected-e2e", path: "packages/cli/tests/fixtures/protected-vault",
          target: { type: "static" }, site: { title: "Protected fixture" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);

      const html = await readFile(resolve(dist, "locked/index.html"), "utf8");
      expect(html).toContain("Unlock note");
      expect(html).not.toContain("PRIVATE_BODY_MARKER");
      expect(html).toContain('http-equiv="content-security-policy"');
      expect(html).toContain("script-src 'self' blob:");
      await expect(access(resolve(dist, "photo.svg"))).rejects.toMatchObject({ code: "ENOENT" });
      const payloadFiles = await readdir(resolve(dist, "__svartz/protected"));
      expect(payloadFiles).toHaveLength(2);
      const envelopes = await Promise.all(payloadFiles.map(async (file) => {
        expect(file).toMatch(/^[A-Za-z0-9_-]+\.json$/);
        return JSON.parse(await readFile(resolve(dist, "__svartz/protected", file), "utf8")) as ProtectedEnvelope;
      }));
      let payload: ProtectedGroupPayload | undefined;
      for (const envelope of envelopes) {
        const key = await deriveProtectionKey("e2e-only-password", envelope.salt);
        try {
          payload = JSON.parse(new TextDecoder().decode(await openProtectedPayload(key, envelope, envelope.id))) as ProtectedGroupPayload;
          break;
        } catch { /* The other group has a different password. */ }
      }
      if (!payload) throw new Error("Friends group was not sealed with its configured password");
      expect(payload.js).toContain("PRIVATE_BODY_MARKER");
      expect(payload.search.map((item: { slug: string }) => item.slug)).toEqual(["locked"]);
      expect(payload.graph.index).toContain("locked");
      expect(payload.assets[0].path).toBe("photo.svg");

      for (const directory of [dist, resolve(ROOT, ".svartz/vaults/protected-e2e/artifacts"), resolve(ROOT, ".svartz/vaults/protected-e2e/.svelte-kit/output")]) {
        const files = await readdir(directory, { recursive: true, withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const contents = await readFile(resolve(file.parentPath, file.name));
          expect(contents.toString("utf8")).not.toMatch(
            /PRIVATE_BODY_MARKER|PRIVATE_DESCRIPTION_MARKER|PRIVATE_ASSET_MARKER|PRIVATE_HIDDEN_TITLE_MARKER|PRIVATE_HIDDEN_BODY_MARKER|PRIVATE_MERMAID_MARKER|SECOND_PRIVATE_MARKER|e2e-only-password|second-e2e-password/,
          );
        }
      }

      const server = createServer(async (request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const file = resolve(dist, `.${pathname}`, pathname.endsWith("/") ? "index.html" : "");
        try {
          const body = await readFile(file);
          const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json" : "application/octet-stream";
          response.writeHead(200, { "content-type": type });
          response.end(body);
        } catch {
          response.writeHead(404);
          response.end();
        }
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Static server has no port");
      const browserPort = address.port + 1;
      const browserProfile = await mkdtemp(resolve(os.tmpdir(), "svartz-static-browser-"));
      const browserProcess = spawn(chromium.executablePath(), [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        `--remote-debugging-port=${browserPort}`,
        `--user-data-dir=${browserProfile}`,
      ], { stdio: "ignore" });
      try {
        let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
            break;
          } catch {
            if (browserProcess.exitCode !== null) throw new Error("Chromium exited before CDP was ready");
            await new Promise((done) => setTimeout(done, 100));
          }
        }
        if (!browser) throw new Error("Chromium CDP did not become ready");
        try {
          const page = await browser.contexts()[0]!.newPage();
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          await page.goto(`http://127.0.0.1:${address.port}/tags/guides/`);
          await page.getByRole("heading", { name: "#Guides" }).waitFor();
          await page.getByRole("button", { name: "Open search (Ctrl+K)" }).click();
          await page.getByRole("searchbox", { name: "Search notes" }).waitFor();
          expect(errors).toEqual([]);
          await page.goto(`http://127.0.0.1:${address.port}/`);
          await page.locator("pre.svartz-mermaid svg").waitFor({ timeout: 10_000 });
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Locked title", exact: true }).click();
          await page.getByLabel("Password").fill("e2e-only-password");
          await page.getByRole("button", { name: "Unlock note" }).click();
          await page.getByText("PRIVATE_BODY_MARKER").waitFor({ timeout: 10_000 });
          await page.locator("pre.svartz-mermaid svg").waitFor({ timeout: 10_000 });
          expect(await page.getByRole("button", { name: "Count: 0" }).count()).toBe(1);
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Second locked title" }).click();
          await page.getByLabel("Password").fill("second-e2e-password");
          await page.getByRole("button", { name: "Unlock note" }).click();
          await page.getByText("SECOND_PRIVATE_MARKER").waitFor({ timeout: 10_000 });
          await page.getByRole("button", { name: "Lock note" }).click();
          await page.getByLabel("Password").waitFor();
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Locked title", exact: true }).click();
          await page.getByText("PRIVATE_BODY_MARKER").waitFor({ timeout: 10_000 });
          expect(errors).toEqual([]);
          await cdp.detach();
          await page.close();
        } finally {
          await browser.close();
        }
      } finally {
        browserProcess.kill("SIGTERM");
        if (browserProcess.exitCode === null) await once(browserProcess, "exit");
        await rm(browserProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        server.close();
        await once(server, "close");
      }
    } finally {
      await rm(configPath, { force: true });
      await rm(resolve(ROOT, ".svartz/vaults/protected-e2e"), { recursive: true, force: true });
      await writeFile(resolve(ROOT, "package.json"), packageSource);
      await writeFile(resolve(ROOT, "turbo.json"), turboSource);
      if (previousPassword === undefined) delete process.env.SVARTZ_TEST_PROTECTED_PASSWORD;
      else process.env.SVARTZ_TEST_PROTECTED_PASSWORD = previousPassword;
      if (previousSecondPassword === undefined) delete process.env.SVARTZ_TEST_SECOND_PASSWORD;
      else process.env.SVARTZ_TEST_SECOND_PASSWORD = previousSecondPassword;
    }
  }, 240_000);
});

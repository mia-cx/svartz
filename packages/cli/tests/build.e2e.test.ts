import { access, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope } from "@svartz/core";

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
          target: { type: "static" }, site: { title: "Docs", url: "https://example.test" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
      await access(resolve(DIST_ROOT, "__svartz/social/index.png"));
      await access(resolve(DIST_ROOT, "__svartz/favicon.svg"));
      await access(resolve(DIST_ROOT, "__svartz/favicon-32.png"));
      await access(resolve(DIST_ROOT, "__svartz/apple-touch-icon.png"));
      const html = await readFile(resolve(DIST_ROOT, "index.html"), "utf8");
      expect(html).toContain("https://example.test/__svartz/social/index.png");
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
    const previousTestGate = process.env.SVARTZ_TEST_PROTECTION;
    process.env.SVARTZ_TEST_PROTECTED_PASSWORD = "e2e-only-password";
    process.env.SVARTZ_TEST_PROTECTION = "1";
    try {
      await writeFile(configPath, `export default {
        version: "1.0.0",
        passwordGroups: { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } },
        vaults: [{ id: "protected-e2e", path: "packages/cli/tests/fixtures/protected-vault",
          target: { type: "static" }, site: { title: "Protected fixture" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);

      const html = await readFile(resolve(dist, "locked/index.html"), "utf8");
      expect(html).toContain("Unlock note");
      expect(html).not.toContain("PRIVATE_BODY_MARKER");
      await expect(access(resolve(dist, "photo.svg"))).rejects.toMatchObject({ code: "ENOENT" });
      const payloadFiles = await readdir(resolve(dist, "__svartz/protected"));
      expect(payloadFiles).toHaveLength(1);
      expect(payloadFiles[0]).toMatch(/^[A-Za-z0-9_-]+\.json$/);
      const envelope = JSON.parse(await readFile(resolve(dist, "__svartz/protected", payloadFiles[0]!), "utf8")) as ProtectedEnvelope;
      const key = await deriveProtectionKey("e2e-only-password", envelope.salt);
      const plaintext = await openProtectedPayload(key, envelope, envelope.id);
      const payload = JSON.parse(new TextDecoder().decode(plaintext));
      expect(payload.js).toContain("PRIVATE_BODY_MARKER");
      expect(payload.search.map((item: { slug: string }) => item.slug)).toEqual(["locked"]);
      expect(payload.graph.index).toContain("locked");
      expect(payload.assets[0].path).toBe("photo.svg");

      for (const directory of [dist, resolve(ROOT, ".svartz/vaults/protected-e2e/artifacts")]) {
        const files = await readdir(directory, { recursive: true, withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const contents = await readFile(resolve(file.parentPath, file.name));
          expect(contents.toString("utf8")).not.toMatch(
            /PRIVATE_BODY_MARKER|PRIVATE_DESCRIPTION_MARKER|PRIVATE_ASSET_MARKER|PRIVATE_HIDDEN_TITLE_MARKER|PRIVATE_HIDDEN_BODY_MARKER|e2e-only-password/,
          );
        }
      }
    } finally {
      await rm(configPath, { force: true });
      await rm(resolve(ROOT, ".svartz/vaults/protected-e2e"), { recursive: true, force: true });
      await writeFile(resolve(ROOT, "package.json"), packageSource);
      await writeFile(resolve(ROOT, "turbo.json"), turboSource);
      if (previousPassword === undefined) delete process.env.SVARTZ_TEST_PROTECTED_PASSWORD;
      else process.env.SVARTZ_TEST_PROTECTED_PASSWORD = previousPassword;
      if (previousTestGate === undefined) delete process.env.SVARTZ_TEST_PROTECTION;
      else process.env.SVARTZ_TEST_PROTECTION = previousTestGate;
    }
  }, 240_000);
});

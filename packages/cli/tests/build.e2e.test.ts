import { access, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

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
      await expect(access(DIST_SITEMAP_PATH)).resolves.toBeUndefined();

      const html = await readFile(DIST_INDEX_PATH, "utf8");
      expect(html).toContain("<title>");
      expect(html).toContain("<h1");
      expect(html).not.toContain('aria-live="polite">Loading');
    },
    240_000,
  );
});

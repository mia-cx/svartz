import { access, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIST_INDEX_PATHS = [
  ".svartz/vaults/docs/dist/index.html",
  ".svartz/vaults/obsidian-journal/dist/index.html",
  ".svartz/vaults/vault/dist/index.html",
].map((relativePath) => resolve(ROOT, relativePath));

async function run(command: string, args: string[]) {
  await execFileAsync(command, args, {
    cwd: ROOT,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("svartz CLI", () => {
  beforeAll(
    async () => {
      await run("pnpm", ["--filter", "@svartz/config", "build"]);
      await run("pnpm", ["--filter", "@svartz/plugins", "build"]);
      await run("pnpm", ["--filter", "@svartz/vite", "build"]);
      await run("pnpm", ["--filter", "svartz", "build"]);
    },
    240_000,
  );

  it(
    "builds all configured vaults when no --vault flag is provided",
    async () => {
      await Promise.all(
        DIST_INDEX_PATHS.map((indexPath) =>
          rm(dirname(indexPath), { recursive: true, force: true }),
        ),
      );

      await run("node", ["packages/cli/dist/index.js", "build"]);

      await Promise.all(
        DIST_INDEX_PATHS.map(async (indexPath) => {
          await expect(access(indexPath)).resolves.toBeUndefined();
        }),
      );
    },
    240_000,
  );
});

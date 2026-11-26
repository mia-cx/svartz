import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { ResolvedConfig } from "@svartz/core";
import { versionVaults } from "../src/versions";

const exec = promisify(execFile);
let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "svartz-versions-"));
  const git = (...args: string[]) => exec("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args]);
  await git("init", "-q");
  await mkdir(join(repo, "rest"));
  await mkdir(join(repo, "mcp"));
  await writeFile(join(repo, "rest/get-pet.md"), "# Get a pet\n");
  await writeFile(join(repo, "mcp/find-pets.md"), "# Find pets\n");
  await git("add", "-A");
  await git("commit", "-qm", "v1");
  await git("tag", "v1");
});

afterEach(() => rm(repo, { recursive: true, force: true }));

/** A vault at `folder` of the fixture repository, with v1 read from the `v1` tag, always building in the same place. */
const vault = (folder: string) => ({
  id: "api",
  path: join(repo, folder),
  outDir: join(repo, ".svartz/api/dist"),
  mountPath: "",
  discovery: { feed: { enabled: true }, sitemap: { enabled: true } },
  theme: { base: "@svartz/theme-api-docs", versions: [{ id: "v2", status: "latest" }, { id: "v1", ref: "v1" }] },
}) as unknown as ResolvedConfig;

// Proves moving a vault to another folder at the same commit publishes that folder, and its build isn't reused.
it("reads a version again when the vault's folder changes at the same commit", async () => {
  const [, rest] = await versionVaults(vault("rest"));
  const [, mcp] = await versionVaults(vault("mcp"));

  expect(await readdir(mcp!.config.path)).toEqual(["find-pets.md"]);
  expect(mcp!.snapshot).not.toBe(rest!.snapshot);
});

// Proves a failed version lets the others finish reading before the build fails and releases its lock, so a retry
// never writes into a snapshot that's still being extracted.
it("finishes reading every version before failing on a missing ref", async () => {
  const config = vault("rest");
  const versions = [{ id: "v2", status: "latest" }, { id: "v1", ref: "v1" }, { id: "v0", ref: "no-such-ref" }];
  const failing = { ...config, theme: { ...config.theme, versions } } as ResolvedConfig;

  await expect(versionVaults(failing)).rejects.toThrow('git has no ref "no-such-ref"');
  expect(await readdir(join(repo, ".svartz/api/versions/v1"))).toContain("source");
});

// Proves a `tar` that can't start fails the build with its own error instead of leaving `git archive` blocked on a full
// pipe, which would hold the build lock until the process is killed.
it("reports a tar that can't start, with an archive larger than the pipe", async () => {
  const git = (...args: string[]) => exec("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args]);
  await writeFile(join(repo, "rest/large.bin"), Buffer.alloc(4 * 1024 * 1024, 1));
  await git("add", "-A");
  await git("commit", "-qm", "large");
  await git("tag", "-f", "v1");
  // A PATH with git and no tar.
  const bin = join(repo, ".bin");
  await mkdir(bin);
  await symlink((await exec("git", ["--exec-path"])).stdout.trim() + "/git", join(bin, "git"));
  const original = process.env.PATH;
  process.env.PATH = bin;
  try {
    await expect(versionVaults(vault("rest"))).rejects.toThrow("spawn tar ENOENT");
  } finally {
    process.env.PATH = original;
  }
}, 10_000);

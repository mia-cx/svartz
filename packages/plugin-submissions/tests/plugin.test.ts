import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runStages, type IndexEntry, type PluginContext, type ResolvedConfig } from "@svartz/core";
import { afterEach, describe, expect, it } from "vitest";
import { submissions } from "../src/index";

let repo: string | undefined;

afterEach(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

const entry = (href: string, notePath: string, locked = false) => ({ href, path: notePath, locked }) as IndexEntry;

/** Run the plugin's build hook over a vault at `content/` in a fresh one-commit repository. */
async function build(options: Partial<Parameters<typeof submissions>[0]> = {}) {
  repo = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-submissions-")));
  const vault = path.join(repo, "content");
  await mkdir(vault);
  await writeFile(path.join(vault, "guide.md"), "# Guide\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo!, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "Build");

  const ctx: PluginContext = {
    config: { path: vault, mountPath: "/wiki" } as ResolvedConfig,
    files: [],
    artifacts: new Map(),
    meta: new Map(),
    index: {
      entries: [
        entry("/wiki/guide/", "guide.md"),
        entry("/wiki/people/ada/", "people/Ada Lovelace.MD"),
        entry("/wiki/secret/", "secret.md", true),
        entry("/wiki/app/", "app.svx"),
      ],
    } as PluginContext["index"],
  };
  const result = await runStages([submissions({ repo: "acme/wiki", ...options })], ctx, ["emitArtifacts"]);
  expect(result.errors).toEqual([]);
  return { ctx, commit: git("rev-parse", "HEAD") };
}

describe("submissions build", () => {
  it("records each editable note's repository path and the build commit for the server only", async () => {
    const { ctx, commit } = await build();

    expect(ctx.compiler?.serverData.get("submissions")).toEqual({
      commit,
      pages: { "/wiki/guide/": "content/guide.md", "/wiki/people/ada/": "content/people/Ada Lovelace.MD" },
    });
    expect(ctx.compiler?.browserResources.get("submissions")?.options).toEqual({
      endpoint: "/wiki/_svartz/submissions",
      pages: ["/wiki/guide/", "/wiki/people/ada/"],
    });
  });

  it("uses the configured vault folder over git's", async () => {
    const { ctx } = await build({ vaultRoot: "./docs/vault/" });

    expect(ctx.compiler?.serverData.get("submissions")).toMatchObject({
      pages: { "/wiki/guide/": "docs/vault/guide.md" },
    });
  });
});

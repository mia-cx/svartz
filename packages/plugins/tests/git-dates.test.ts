import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { readGitDates } from "../src/internal/git-dates";

const exec = promisify(execFile);

it("reads first and latest commit dates for a vault nested in a repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "svartz-git-dates-"));
  const vault = join(root, "content", "blog");
  try {
    await mkdir(vault, { recursive: true });
    await exec("git", ["init", "-q", root]);
    const commit = async (date: string) => {
      await exec("git", ["-C", root, "add", "."]);
      await exec("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com",
        "commit", "-qm", date], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    };
    await writeFile(join(vault, "note.md"), "First");
    await commit("2020-01-02T03:04:05+00:00");
    await writeFile(join(vault, "note.md"), "Second");
    await commit("2022-01-02T03:04:05+00:00");

    const dates = await readGitDates(vault);
    expect(dates.get("note.md")?.createdAt.toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(dates.get("note.md")?.modifiedAt.toISOString()).toBe("2022-01-02T03:04:05.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

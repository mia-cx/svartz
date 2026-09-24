import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
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
    await rename(join(vault, "note.md"), join(vault, "renamed.md"));
    await commit("2023-01-02T03:04:05+00:00");

    const dates = await readGitDates(vault);
    expect(dates.get("renamed.md")?.createdAt.toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(dates.get("renamed.md")?.modifiedAt.toISOString()).toBe("2023-01-02T03:04:05.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("does not inherit dates from an earlier file that used the same path", async () => {
  const root = await mkdtemp(join(tmpdir(), "svartz-git-dates-reused-"));
  const vault = join(root, "vault");
  try {
    await mkdir(vault);
    await exec("git", ["init", "-q", root]);
    const commit = async (date: string) => {
      await exec("git", ["-C", root, "add", "-A"]);
      await exec("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com",
        "commit", "-qm", date], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    };
    await writeFile(join(vault, "a.md"), "An older note");
    await commit("2010-01-02T03:04:05+00:00");
    await unlink(join(vault, "a.md"));
    await commit("2011-01-02T03:04:05+00:00");
    await writeFile(join(vault, "a.md"), "A new note");
    await commit("2020-01-02T03:04:05+00:00");
    await rename(join(vault, "a.md"), join(vault, "b.md"));
    await commit("2022-01-02T03:04:05+00:00");

    const dates = await readGitDates(vault);
    expect(dates.get("b.md")?.createdAt.toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(dates.get("b.md")?.modifiedAt.toISOString()).toBe("2022-01-02T03:04:05.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("starts a new lifetime when a deleted path is recreated without a rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "svartz-git-dates-recreated-"));
  const vault = join(root, "vault");
  try {
    await mkdir(vault);
    await exec("git", ["init", "-q", root]);
    const commit = async (date: string) => {
      await exec("git", ["-C", root, "add", "-A"]);
      await exec("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com",
        "commit", "-qm", date], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    };
    await writeFile(join(vault, "a.md"), "An older note");
    await commit("2010-01-02T03:04:05+00:00");
    await unlink(join(vault, "a.md"));
    await commit("2011-01-02T03:04:05+00:00");
    await writeFile(join(vault, "a.md"), "A new note");
    await commit("2020-01-02T03:04:05+00:00");

    const dates = await readGitDates(vault);
    expect(dates.get("a.md")?.createdAt.toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(dates.get("a.md")?.modifiedAt.toISOString()).toBe("2020-01-02T03:04:05.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

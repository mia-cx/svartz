import { execFile, spawn } from "node:child_process";
import { relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitDates {
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}

/** Stream one history walk. Rename aliases retain the first commit date of each current path. */
export async function readGitDates(vaultPath: string): Promise<ReadonlyMap<string, GitDates>> {
  let repositoryRoot: string;
  try {
    repositoryRoot = (await exec("git", ["-C", vaultPath, "rev-parse", "--show-toplevel"])).stdout.trim();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: number }).code;
    if (code === "ENOENT" || code === 128) return new Map();
    throw error;
  }

  const scope = relative(repositoryRoot, vaultPath) || ".";
  const tracked = (await exec("git", ["-C", repositoryRoot, "ls-files", "--cached", "--full-name", "-z", "--", scope], {
    maxBuffer: 16 * 1024 * 1024,
  })).stdout.split("\0").filter(Boolean);
  const child = spawn("git", ["-C", repositoryRoot, "-c", "core.quotePath=false", "log",
    "--format=COMMIT:%cI", "--name-status", "--find-renames", "--", scope]);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<void>((done, fail) => {
    child.once("error", fail);
    child.once("close", (code) => {
      if (code === 0 || (code === 128 && stderr.includes("does not have any commits yet"))) done();
      else fail(new Error(`git log failed (${code}): ${stderr.trim()}`));
    });
  });
  const dates = new Map<string, GitDates>();
  const active = new Map(tracked.map((path) => [path, path]));
  let commitDate: Date | undefined;
  const record = (currentPath: string): void => {
    if (!commitDate) return;
    const file = relative(vaultPath, resolve(repositoryRoot, currentPath)).replaceAll("\\", "/");
    if (!file || file === ".." || file.startsWith("../")) return;
    const previous = dates.get(file);
    dates.set(file, { createdAt: commitDate, modifiedAt: previous?.modifiedAt ?? commitDate });
  };

  try {
    await Promise.all([(async () => {
      for await (const raw of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
        if (raw.startsWith("COMMIT:")) {
          commitDate = new Date(raw.slice("COMMIT:".length));
          continue;
        }
        const [status, source, target] = raw.split("\t");
        if (!status || !source) continue;
        if (status.startsWith("R") && target) {
          const currentPath = active.get(target);
          if (!currentPath) continue;
          record(currentPath);
          active.delete(target);
          active.set(source, currentPath);
          continue;
        }
        const currentPath = active.get(source);
        if (!currentPath) continue;
        if (status !== "D") record(currentPath);
        if (status === "A") active.delete(source);
      }
    })(), closed]);
  } catch (error) {
    child.kill();
    throw error;
  }
  return dates;
}

import { execFile } from "node:child_process";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitDates {
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}

/** Read all paths in one history walk. A new file falls back to its filesystem dates. */
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
  const { stdout } = await exec("git", ["-C", repositoryRoot, "-c", "core.quotePath=false", "log",
    "--format=COMMIT:%cI", "--name-only", "--no-renames", "--", scope],
  { maxBuffer: 20 * 1024 * 1024 });
  const dates = new Map<string, GitDates>();
  let commitDate: Date | undefined;
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("COMMIT:")) {
      commitDate = new Date(line.slice("COMMIT:".length));
      continue;
    }
    if (!line || !commitDate) continue;
    const file = relative(vaultPath, resolve(repositoryRoot, line)).replaceAll("\\", "/");
    if (file.startsWith("..")) continue;
    const previous = dates.get(file);
    dates.set(file, { createdAt: commitDate, modifiedAt: previous?.modifiedAt ?? commitDate });
  }
  return dates;
}

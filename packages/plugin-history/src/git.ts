/**
 * Reading a note's past from the vault's own git repository at build time: the commits that changed its file, across
 * renames, and the file as each one left it. Only what a version page shows leaves here: a commit's author name, date
 * and message, never an email.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Room for the log of a long-lived note: a commit's record is its message and two paths. */
const MAX_LOG_BYTES = 64 * 1024 * 1024;

/** One commit that changed a note's file, newest first in {@link commitsOf}. */
export interface Commit {
  readonly sha: string;
  /** The author's name as git (and `.mailmap`) gives it. */
  readonly author: string;
  /** When the author made the change, ISO 8601. */
  readonly at: string;
  /** The first line of the commit's message. */
  readonly summary: string;
  /** The file's path in the repository after this commit; `undefined` when the commit deleted it. */
  readonly path: string | undefined;
}

/** The repository a folder is in. */
export interface Repository {
  readonly root: string;
  /** The folder's path in the repository, `""` at its root or ending in a slash, such as `content/blog/`. */
  readonly prefix: string;
  /** A shallow clone, whose history stops short. */
  readonly shallow: boolean;
}

/** The repository `folder` is in, or `undefined` outside one. */
export async function repositoryOf(folder: string): Promise<Repository | undefined> {
  let lines: string[];
  try {
    lines = (await exec("git", ["-C", folder, "rev-parse", "--show-toplevel", "--show-prefix", "--is-shallow-repository"])).stdout.split("\n");
  } catch {
    return undefined;
  }
  const [root = "", prefix = "", shallow] = lines;
  return { root, prefix, shallow: shallow === "true" };
}

/**
 * Every commit that changed the file at `path` (relative to the repository `root`), newest first, following it back
 * through renames. Merge commits are left out: what they bring in shows in the commits they merge.
 */
export async function commitsOf(root: string, path: string): Promise<Commit[]> {
  // NUL ends each field, and git messages and names never hold one. Each record is the sha, author, date and message,
  // then the file's status and its path, or for a rename or copy its old path and then its new one.
  const { stdout } = await exec(
    "git",
    ["-C", root, "-c", "core.quotePath=false", "log", "--follow", "--no-merges", "-z", "--format=%H%x00%aN%x00%aI%x00%B", "--name-status", "--", path],
    { maxBuffer: MAX_LOG_BYTES },
  );
  const fields = stdout.split("\0");
  const commits: Commit[] = [];
  let index = 0;
  const next = () => (fields[index++] ?? "").replace(/^\n/, "");
  while (index < fields.length) {
    const sha = next();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) continue;
    const author = next();
    const at = new Date(next()).toISOString();
    const summary = next().split("\n", 1)[0]!.trim();
    const status = next();
    const paths = /^[RC]/.test(status) ? [next(), next()] : [next()];
    commits.push({ sha, author, at, summary, path: status === "D" ? undefined : paths.at(-1) });
  }
  return commits;
}

/** `git <args>` in `root`, given `input`, answering what it printed. */
async function pipe(root: string, args: readonly string[], input: string): Promise<Buffer> {
  const child = spawn("git", ["-C", root, ...args], { stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`git ${args[0]} failed (${code}): ${stderr.trim()}`))));
  });
  child.stdin.end(input);
  await closed;
  return Buffer.concat(chunks);
}

/** The paths, in the repository, of every file each of `shas` changed, read in one `git diff-tree`. */
export async function filesChanged(root: string, shas: readonly string[]): Promise<Map<string, string[]>> {
  const files = new Map<string, string[]>();
  if (shas.length === 0) return files;
  const output = await pipe(root, ["-c", "core.quotePath=false", "diff-tree", "--stdin", "--root", "-r", "-z", "--name-only", "--no-renames"], shas.map((sha) => `${sha}\n`).join(""));
  // Each commit's sha, then the paths it changed, in the order asked: a path never starts a group by accident.
  let next = 0;
  let current: string[] | undefined;
  for (const field of output.toString("utf8").split("\0")) {
    if (field === "") continue;
    if (field === shas[next]) {
      current = [];
      files.set(shas[next++]!, current);
    } else {
      current?.push(field);
    }
  }
  return files;
}

/** The paths, in the repository, of every file in the tree of commit `sha` below the folder `prefix`. */
export async function filesAt(root: string, sha: string, prefix: string): Promise<string[]> {
  const { stdout } = await exec("git", ["-C", root, "-c", "core.quotePath=false", "ls-tree", "-r", "-z", "--name-only", sha, "--", prefix || "."], {
    maxBuffer: MAX_LOG_BYTES,
  });
  return stdout.split("\0").filter(Boolean);
}

/**
 * The bytes of each file in `specs`, each `<commit>:<path>`, read in one `git cat-file --batch`: `undefined` for one
 * the repository doesn't hold.
 */
export async function readFiles(root: string, specs: readonly string[]): Promise<(Buffer | undefined)[]> {
  if (specs.length === 0) return [];
  // Each answer is `<oid> <type> <size>\n<content>\n`, or `<spec> missing\n` (or `ambiguous`).
  const output = await pipe(root, ["cat-file", "--batch"], specs.map((spec) => `${spec}\n`).join(""));
  let offset = 0;
  return specs.map(() => {
    const end = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, end).toString("utf8");
    offset = end + 1;
    const found = /^[0-9a-f]{40,64} (\w+) (\d+)$/.exec(header);
    if (!found) return undefined;
    const length = Number(found[2]);
    const content = output.subarray(offset, offset + length);
    offset += length + 1;
    return found[1] === "blob" ? Buffer.from(content) : undefined;
  });
}

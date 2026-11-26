/**
 * Versioned docs. A vault whose theme lists `versions` builds once per version, in one app: the latest is the vault as
 * it stands, at its own mount, and every other version is a frozen snapshot of the vault's folder at a git ref, mounted
 * at `<mount>/<id>/`. Each version is a vault of its own to the build, with its own pages, search and assets.
 */
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ResolvedConfig } from "@svartz/core";
import { getVaultBuildRoot } from "@svartz/vite";

const exec = promisify(execFile);

/** `latest` is served at the unversioned URL; `deprecated` pages point readers to it. */
export type VersionStatus = "latest" | "supported" | "deprecated";

/** One entry of a vault's `theme.versions`, as configured. */
export interface VersionSpec {
  /** Its URL segment, such as `2026-01`. */
  readonly id: string;
  /** The git tag, branch or commit holding the version's docs. The latest version takes none: it's the vault itself. */
  readonly ref?: string;
  readonly status: VersionStatus;
}

/** A vault as the build runs it: its config, and what the Vite plugin needs to know beyond it. */
export interface VersionVault {
  readonly config: ResolvedConfig;
  /** Where a snapshot was read from, `<commit>:<folder>`: its build is cached, since its files never change. */
  readonly snapshot?: string;
  /** The mounts of the versions built inside this vault's: no page of its own may sit below one. */
  readonly nestedMounts?: readonly string[];
}

const STATUSES: readonly VersionStatus[] = ["latest", "supported", "deprecated"];
/** A version id is one URL segment that reads as written: `2026-01`, `v2`, `1.4`. */
const VERSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Every promise's value once all have settled, or the first failure, thrown only then: a failed version must not end the
 * build, and release its lock, while another is still writing its snapshot.
 */
export async function settled<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The vault's `theme.versions`, checked, or `undefined` when it lists none. Throws on the first problem, naming it. */
export function readVersions(vault: ResolvedConfig): VersionSpec[] | undefined {
  const raw = vault.theme["versions"];
  if (raw === undefined) return undefined;
  const fail = (problem: string) => new Error(`Vault "${vault.id}": theme.versions ${problem}`);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail('must list the versions, such as [{ id: "2026-04", status: "latest" }, { id: "2026-01", ref: "api/2026-01" }].');
  }
  const versions = raw.map((item, index): VersionSpec => {
    if (!isRecord(item)) throw fail(`[${index}] must be an object with an id.`);
    const { id, ref, status = "supported" } = item;
    if (typeof id !== "string" || !VERSION_ID.test(id)) {
      throw fail(`[${index}] needs an id made of letters, digits, ".", "_" and "-", such as "2026-01".`);
    }
    if (!STATUSES.includes(status as VersionStatus)) throw fail(`"${id}" has status ${JSON.stringify(status)}; use latest, supported or deprecated.`);
    if (status === "latest") {
      if (ref !== undefined) throw fail(`"${id}" is the latest version, which the vault's own files are; remove its ref.`);
      return { id, status: "latest" };
    }
    // A ref starting with "-" would read as an option to git.
    if (typeof ref !== "string" || !ref.trim() || ref.trim().startsWith("-")) {
      throw fail(`"${id}" needs a ref: the git tag or branch holding its docs.`);
    }
    return { id, ref: ref.trim(), status: status as VersionStatus };
  });
  const repeated = versions.find((version, index) => versions.findIndex((other) => other.id === version.id) !== index);
  if (repeated) throw fail(`lists "${repeated.id}" twice.`);
  const latest = versions.filter((version) => version.status === "latest");
  if (latest.length !== 1) throw fail(`must have exactly one latest version; it has ${latest.length}.`);
  return versions;
}

/** `git <args>` in `cwd`, answering its trimmed output, or failing with what git said. */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    return (await exec("git", ["-C", cwd, ...args])).stdout.trim();
  } catch (cause) {
    const stderr = (cause as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || String(cause));
  }
}

/** Writes the vault folder's files at `commit` into `target`, dated by the commit, without touching the checkout. */
async function extract(root: string, commit: string, prefix: string, target: string): Promise<void> {
  // An archive of a commit dates each file by the commit, so the snapshot's dates are the version's, every build.
  const archive = spawn("git", ["-C", root, "archive", "--format=tar", commit, "--", prefix || "."], { stdio: ["ignore", "pipe", "pipe"] });
  const depth = prefix.split("/").filter(Boolean).length;
  const unpack = spawn("tar", ["-x", "-f", "-", "-C", target, `--strip-components=${depth}`], { stdio: ["pipe", "ignore", "pipe"] });
  archive.stdout.pipe(unpack.stdin);
  // A broken pipe into tar means tar failed or was stopped, which tar's own wait reports.
  unpack.stdin.on("error", () => {});
  let failure: Error | undefined;
  const done = (child: typeof archive | typeof unpack, name: string) => new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    const fail = (error: Error) => {
      // Either child failing stops both: the other would wait forever on a pipe nothing fills or drains.
      failure ??= error;
      archive.kill();
      unpack.kill();
      reject(error);
    };
    child.once("error", fail);
    child.once("close", (code) => (code === 0 ? resolve() : fail(new Error(`${name} failed (${code}): ${stderr.trim()}`))));
  });
  // The first failure, not the one stopping the other child caused.
  await settled([done(archive, "git archive"), done(unpack, "tar")]).catch(() => {
    throw failure;
  });
}

/**
 * The vault's folder as `version.ref` holds it, in `<vault build>/versions/<id>/vault/`, and where it came from:
 * `<commit>:<folder in the repository>`. It's read again only when that changes: the ref moved, or the vault did.
 */
async function snapshot(vault: ResolvedConfig, version: VersionSpec, folder: string): Promise<{ path: string; source: string }> {
  const name = `Vault "${vault.id}" version "${version.id}"`;
  let root: string;
  let prefix: string;
  try {
    [root = "", prefix = ""] = (await git(vault.path, ["rev-parse", "--show-toplevel", "--show-prefix"])).split("\n");
  } catch {
    throw new Error(`${name}: ${vault.path} isn't in a git repository, which versions are read from.`);
  }
  let commit: string;
  try {
    commit = await git(root, ["rev-parse", "--verify", `${version.ref}^{commit}`]);
  } catch {
    throw new Error(`${name}: git has no ref "${version.ref}". In a CI checkout, fetch it first, such as with \`git fetch --tags\`.`);
  }
  const source = `${commit}:${prefix}`;
  const target = path.join(folder, "vault");
  const marker = path.join(folder, "source");
  const extracted = await readFile(marker, "utf8").catch(() => undefined);
  if (extracted === source) return { path: target, source };
  await rm(marker, { force: true });
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  try {
    await extract(root, commit, prefix, target);
  } catch (cause) {
    throw new Error(`${name}: could not read ${prefix || "the repository"} at "${version.ref}": ${(cause as Error).message}`);
  }
  await writeFile(marker, source);
  return { path: target, source };
}

/**
 * The vaults `vault` builds as: itself alone, or with `theme.versions`, itself as the latest version, then a snapshot
 * vault per other version. Each one's theme gets `version`, its own id, and `versions`, every id and status (never a
 * ref), which the picker reads.
 */
export async function versionVaults(vault: ResolvedConfig): Promise<VersionVault[]> {
  const versions = readVersions(vault);
  if (!versions) return [{ config: vault }];
  const listed = versions.map(({ id, status }) => ({ id, status }));
  const latest = versions.find((version) => version.status === "latest")!;
  const older = versions.filter((version) => version.status !== "latest");
  const mountOf = (version: VersionSpec) => `${vault.mountPath}/${version.id}`;
  const snapshots = await settled(older.map(async (version): Promise<VersionVault> => {
    const folder = path.join(getVaultBuildRoot(vault), "versions", version.id);
    const { path: vaultPath, source } = await snapshot(vault, version, folder);
    return {
      config: {
        ...vault,
        id: `${vault.id}@${version.id}`,
        path: vaultPath,
        outDir: path.join(folder, "dist"),
        mountPath: mountOf(version),
        theme: { ...vault.theme, version: version.id, versions: listed },
        // Only the latest version is listed for crawlers and subscribers; older pages stay reachable by URL.
        discovery: { ...vault.discovery, feed: { ...vault.discovery.feed, enabled: false }, sitemap: { enabled: false } },
      },
      snapshot: source,
    };
  }));
  return [
    {
      config: { ...vault, theme: { ...vault.theme, version: latest.id, versions: listed } },
      nestedMounts: older.map(mountOf),
    },
    ...snapshots,
  ];
}

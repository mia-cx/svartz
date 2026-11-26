/**
 * The build cache of a version snapshot (`SvartzVitePluginOptions.snapshot`). A snapshot's files never change, so once
 * its pipeline has run, the files it wrote (page modules, index, search, public files, runtime modules) stay valid
 * while nothing else it read changes: the commit and folder it came from, the vault's config and plugins, the files
 * they read, the theme, host routes, Svartz's own code and the lockfile. Vaults with password groups are never cached.
 * The entry records what the build needs from that run beyond those files, beside them in the vault's build root, so
 * deleting the build root deletes both.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeValue, type ResolvedConfig } from "@svartz/core";
import { getVaultBuildRoot } from "./artifacts";

/** Bumped when an entry's shape or what a snapshot's build writes changes: every older entry stops matching. */
const FORMAT = 1;
/** Lockfiles that pin every dependency the pipeline runs. */
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];
/** The packages whose code runs a vault's pipeline, besides this one. */
const PACKAGES = ["@svartz/core", "@svartz/plugins"] as const;

/** What a cached snapshot build restores: its public files and its Markdown negotiation map. */
export interface SnapshotBuild {
  readonly assets: ReadonlyArray<{ readonly key: string; readonly fileName: string; readonly path: string }>;
  readonly markdownRoutes: Readonly<Record<string, string>>;
}

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Every file in `folder`, by path and content. */
async function folderHash(folder: string): Promise<string> {
  try {
    const files = (await readdir(folder, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    const parts = await Promise.all(files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return `${path.slice(folder.length)}:${hash(await readFile(path))}`;
    }));
    return hash(parts.sort().join("\n"));
  } catch {
    return `unreadable:${folder}`;
  }
}

/** The nearest lockfile above `folder`, by content. */
async function lockfileHash(folder: string): Promise<string> {
  for (let at = resolve(folder); ; at = dirname(at)) {
    for (const name of LOCKFILES) {
      const content = await readFile(join(at, name)).catch(() => undefined);
      if (content) return hash(content);
    }
    if (dirname(at) === at) return "none";
  }
}

let software: Promise<string> | undefined;

/** Svartz's pipeline code by content, not version number, so a rebuilt workspace builds every snapshot again. */
function softwareHash(): Promise<string> {
  return software ??= (async () => {
    const folders = [dirname(fileURLToPath(import.meta.url)), ...PACKAGES.map((name) => {
      try {
        return dirname(fileURLToPath(import.meta.resolve(name)));
      } catch {
        return `unresolved:${name}`;
      }
    })];
    return hash((await Promise.all(folders.map(folderHash))).join("\n"));
  })();
}

/**
 * Whether a snapshot's build may be cached. A vault with password groups never is: its build checks and encrypts with
 * the passwords' current values, which a key must not hold, so a rotated password could leave the old one working.
 */
export const snapshotCacheable = (config: ResolvedConfig) => Object.keys(config.passwordGroups ?? {}).length === 0;

/** `file`, resolved against the vault, by content. */
const fileHash = (vault: string, file: string) => readFile(resolve(vault, file)).then(hash, () => "unreadable");

/**
 * The key of a snapshot's build: its source (commit and folder), the files its plugins read (`reads`) by content, and
 * everything else its pipeline and generated modules read.
 */
export async function snapshotKey(config: ResolvedConfig, source: string, inputs: unknown, reads: readonly string[]): Promise<string> {
  return hash(describeValue({
    format: FORMAT,
    source,
    software: await softwareHash(),
    lockfile: await lockfileHash(config.path),
    config,
    favicon: config.site.favicon ? await fileHash(config.path, config.site.favicon) : "none",
    reads: await Promise.all(reads.map(async (file) => [file, await fileHash(config.path, file)])),
    inputs,
  }));
}

const entryPath = (config: ResolvedConfig) => join(getVaultBuildRoot(config), "snapshot-build.json");

/** The build cached for `key`, or `undefined` when there's none or it was made from other inputs. */
export async function readSnapshotBuild(config: ResolvedConfig, key: string): Promise<SnapshotBuild | undefined> {
  try {
    const entry = JSON.parse(await readFile(entryPath(config), "utf8")) as { key: string; build: SnapshotBuild };
    return entry.key === key ? entry.build : undefined;
  } catch {
    return undefined;
  }
}

/** Records `build` under `key`, whole or not at all. */
export async function writeSnapshotBuild(config: ResolvedConfig, key: string, build: SnapshotBuild): Promise<void> {
  const path = entryPath(config);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, JSON.stringify({ key, build }));
  await rename(temporary, path);
}

/** Forgets the cached build, before a pipeline run rewrites the files it names. */
export async function clearSnapshotBuild(config: ResolvedConfig): Promise<void> {
  await rm(entryPath(config), { force: true });
}

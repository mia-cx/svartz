/**
 * The cache of compiled versions: a version's markup never changes once committed, unless what its compile reads
 * changes, so later builds reuse it. Each entry is a JSON file named by the hash of everything that decides it
 * (see `fingerprint` and `versionKey`), in `cache/versions/` beside the vault's build artifacts, where it survives
 * local builds and can be restored in CI. Which versions show is decided before the cache is read, so it never
 * serves a version the build would hide, and holds only versions that showed.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describeValue, getCompilerContributions, type BrowserResource, type PluginContext } from "@svartz/core";
import { softwareFingerprint } from "./software";

/** Bumped when an entry's shape or what a version's compile means changes: every older entry stops matching. */
const FORMAT = 1;
/** Lockfiles that pin every other dependency a compile runs, Markdown plugins included. */
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];

/** A cached version: what `compileNoteVersion` answered, and where each attachment it needs is published. */
export interface CachedVersion {
  readonly markup: string;
  /** Its attachments: one still in the vault by its path, one gone from it by the snapshot published for it. */
  readonly attachments: ReadonlyArray<{ readonly path: string; readonly snapshot?: { readonly key: string; readonly blob: string } }>;
  /** The browser resources its steps need, such as the diagram script, which the build gets when it's served. */
  readonly resources: readonly BrowserResource[];
}

const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

/** The nearest lockfile above `folder`, by content: it pins every dependency a compile runs. */
async function lockfileHash(folder: string): Promise<string> {
  for (let at = resolve(folder); ; at = dirname(at)) {
    for (const name of LOCKFILES) {
      try {
        return hash(await readFile(join(at, name)));
      } catch {
        // Not here.
      }
    }
    if (dirname(at) === at) return "none";
  }
}

/** What every version a build compiles reads, beyond the version and the published notes, which keys add per note. */
export async function buildFingerprint(ctx: PluginContext, extra: unknown): Promise<string> {
  const compiler = getCompilerContributions(ctx);
  return hash(describeValue({
    format: FORMAT,
    software: await softwareFingerprint(),
    lockfile: await lockfileHash(ctx.config.path),
    config: ctx.config,
    // The plugins the build runs, Svartz's defaults and the theme's presets included, which `config` lacks: their
    // hooks by source, and the `options` each was made from, since values a hook closes over don't show in its source.
    plugins: (ctx.plugins ?? []).map((plugin) => ({ ...plugin })),
    // The files they read while compiling, such as a bibliography, by content: their paths alone are in `plugins`.
    reads: await Promise.all((ctx.plugins ?? []).flatMap(({ reads = [] }) => reads).map(async (path) => {
      try {
        return [path, hash(await readFile(resolve(ctx.config.path, path)))];
      } catch {
        return [path, "unreadable"];
      }
    })),
    compiler: { remark: compiler.remarkPlugins, rehype: compiler.rehypePlugins, svx: compiler.svxSourceTransforms },
    roamMedia: ctx.meta.get("svartz:roamMedia") === true,
    extra,
  }));
}

/** A published file as a version's compile reads it: as a link target, and as an embed's source. */
export interface FileFingerprint {
  /** Its path, route, frontmatter and protection: what resolving a link to it reads. */
  readonly target: string;
  /** Its source, which only embedding it reads. */
  readonly body: string;
}

/** Each file the build publishes, as a version's links and embeds read it. */
export function fileFingerprints(ctx: PluginContext): Map<string, FileFingerprint> {
  const bodies = ctx.meta.get("sourceBodies") as ReadonlyMap<string, string> | undefined;
  return new Map(ctx.files.map((file) => [file.path, {
    target: hash(describeValue({ path: file.path, slug: file.slug, frontmatter: file.frontmatter, protection: file.protection })),
    body: hash(bodies?.get(file.path) ?? ""),
  }]));
}

/**
 * Whether `markdown` may embed another note, whose source its compile then reads: Obsidian's `![[…]]`, and any
 * `{{…}}` a plugin might expand. Saying yes when unsure only compiles a version again.
 */
export const mayEmbed = (markdown: string) => markdown.includes("![[") || markdown.includes("{{");

/**
 * The key of one version: the build's fingerprint, every published file but the note's own (with their sources when
 * the version may embed one), and the version itself: its commit, its path then, and the note whose place it takes.
 */
export function versionKey(
  build: string,
  files: ReadonlyMap<string, FileFingerprint>,
  note: { readonly slug: string; readonly path: string; readonly href: string },
  version: { readonly sha: string; readonly path: string; readonly embeds: boolean },
): string {
  // The version takes the note's place in its compile, so the note's own file, which each commit changes, isn't read.
  const others = [...files].filter(([path]) => path !== note.path)
    .map(([path, { target, body }]) => `${path}:${target}${version.embeds ? `:${body}` : ""}`).sort();
  return hash(describeValue({ build, others: hash(others.join("\n")), note, version }));
}

/** Compiled versions on disk, in `<vault build>/cache/versions/<key>.json`. */
export class VersionCache {
  private readonly used = new Set<string>();

  private constructor(private readonly folder: string) {}

  /** The cache of the vault `ctx` builds. */
  static for(ctx: PluginContext): VersionCache {
    return new VersionCache(resolve(ctx.config.outDir, "..", "cache", "versions"));
  }

  /** The version cached at `key`; `undefined` when there's none, or it can't be read. Marks `key` as in use. */
  async get(key: string): Promise<CachedVersion | undefined> {
    this.used.add(key);
    try {
      return JSON.parse(await readFile(join(this.folder, `${key}.json`), "utf8")) as CachedVersion;
    } catch {
      return undefined;
    }
  }

  /** Keeps `value` at `key`, written whole or not at all. */
  async set(key: string, value: CachedVersion): Promise<void> {
    this.used.add(key);
    await mkdir(this.folder, { recursive: true });
    const temporary = join(this.folder, `${key}.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(value));
    await rename(temporary, join(this.folder, `${key}.json`));
  }

  /** Removes every entry this build didn't use, so the cache holds only versions that show now. */
  async prune(): Promise<void> {
    try {
      await access(this.folder);
    } catch {
      return;
    }
    for (const name of await readdir(this.folder)) {
      if (!this.used.has(name.replace(/\.json$/, ""))) await rm(join(this.folder, name), { force: true });
    }
  }
}

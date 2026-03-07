// --- Utility types ---

type MaybePromise<T> = T | Promise<T>;

// --- Shared primitives ---

type LinkResolutionStrategy = "closest" | "shallowest" | "absolute";

interface TargetConfig {
  readonly type: string;
  readonly [key: string]: unknown;
}

// --- Resolved config contracts ---

interface ResolvedFrontmatterConfig {
  readonly titleField: string;
  readonly descriptionField: string;
  readonly tagsField: string;
  readonly aliasesField: string;
  readonly createdAtField: string;
  readonly updatedAtField: string;
  readonly publishedField: string;
  readonly dateFormat?: string;
}

interface ResolvedThemeConfig {
  readonly base: string;
  readonly [key: string]: unknown;
}

interface ResolvedBuildConfig {
  readonly concurrency: number;
  readonly maxRetries: number;
}

interface ResolvedVaultDefaults {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
}

/** Canonical single-vault build config consumed by the runner and @svartz/vite. */
interface ResolvedConfig {
  readonly version: string;
  readonly $schema?: string;
  readonly id: string;
  readonly path: string;
  readonly outDir: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
  readonly target: TargetConfig;
  readonly plugins: readonly unknown[];
}

// --- Artifact model ---

interface Artifact {
  readonly key: string;
  readonly path: string;
  readonly type: string;
  readonly pluginId: string;
  readonly contents: string | Uint8Array;
  readonly noteSlug?: string;
  readonly mimeType?: string;
  readonly meta?: Record<string, unknown>;
}

type ArtifactBag = Map<string, Artifact>;

// --- Pipeline types ---

interface TocEntry {
  readonly depth: number;
  readonly text: string;
  readonly slug: string;
}

interface SearchDocument {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
}

interface TagIndexEntry {
  readonly slug: string;
  readonly title: string;
  readonly noteCount: number;
  readonly href: string;
}

interface FolderIndexEntry {
  readonly slug: string;
  readonly title: string;
  readonly noteCount: number;
  readonly href: string;
}

interface RouteIndex {
  readonly notes: readonly string[];
  readonly tags: readonly string[];
  readonly folders: readonly string[];
  readonly all: readonly string[];
}

interface AssetRecord {
  readonly path: string;
  readonly sourcePath: string;
  readonly mimeType?: string;
}

/**
 * A link extracted from markdown before resolution.
 * Mirrors vault's LinkMatch — kept Effect-free for plugin authors.
 */
interface RawLink {
  readonly raw: string;
  readonly target: string;
  readonly section?: string;
  readonly label?: string;
  readonly type: "wikilink" | "markdown";
}

/**
 * A file passing through the plugin pipeline.
 *
 * Postconditions by stage:
 *   - after discoverFiles: `slug` is assigned (vault-relative, extensionless, case-normalized)
 *   - after parseFrontmatter: `frontmatter` is populated
 *   - after parseFrontmatter: `rawLinks` is populated
 *   - after resolveLinks: `links` contains resolved slug strings
 */
interface ProcessedFile {
  readonly path: string;
  readonly sourcePath?: string;
  readonly extension?: string;
  slug: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  rawLinks?: RawLink[];
  links?: string[];
  createdAt?: Date;
  modifiedAt?: Date;
  toc?: readonly TocEntry[];
}

interface ChangeEvent {
  type: "add" | "change" | "unlink";
  file: string;
  timestamp?: number;
  [key: string]: unknown;
}

// --- Index/Graph contracts ---

interface IndexLink {
  readonly raw: string;
  readonly href: string | null;
  readonly section?: string;
  readonly label?: string;
}

interface IndexEntry {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly content: string;
  readonly links: readonly IndexLink[];
  readonly toc: readonly TocEntry[];
  readonly wordCount: number;
  readonly readingTimeMinutes: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
  readonly publishedAt?: Date;
}

/**
 * Canonical index artifact produced by `core:index`.
 * Single source of truth for search, backlinks, and graph projections.
 */
interface Index {
  readonly version: string;
  readonly entries: readonly IndexEntry[];
  readonly graph: Readonly<Record<string, readonly string[]>>;
  readonly backlinks: Readonly<Record<string, readonly string[]>>;
  readonly search: readonly SearchDocument[];
  readonly tags: readonly TagIndexEntry[];
  readonly folders: readonly FolderIndexEntry[];
  readonly routes: RouteIndex;
  readonly assets: readonly AssetRecord[];
}

/** Rich graph node for UI consumers (projection of Index). */
interface GraphTarget {
  readonly slug: string;
  readonly title: string;
  readonly tags: readonly string[];
}

type Graph = Readonly<Record<string, readonly GraphTarget[]>>;

export type {
  Artifact,
  AssetRecord,
  ArtifactBag,
  ChangeEvent,
  FolderIndexEntry,
  Graph,
  GraphTarget,
  Index,
  IndexEntry,
  IndexLink,
  LinkResolutionStrategy,
  MaybePromise,
  ProcessedFile,
  RawLink,
  ResolvedBuildConfig,
  ResolvedConfig,
  ResolvedFrontmatterConfig,
  ResolvedThemeConfig,
  ResolvedVaultDefaults,
  RouteIndex,
  SearchDocument,
  TargetConfig,
  TagIndexEntry,
  TocEntry,
};

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

interface ResolvedSiteConfig {
  readonly title: string;
  readonly description?: string;
  readonly url?: string;
  readonly author?: string;
  readonly image?: string;
  readonly favicon?: string;
}

type DateSource = "frontmatter" | "git" | "filesystem";

interface ResolvedDiscoveryConfig {
  readonly feed: {
    readonly enabled: boolean;
    readonly limit: number;
    readonly content: "summary" | "full";
    readonly sort: "published" | "modified";
  };
  readonly sitemap: { readonly enabled: boolean };
  readonly socialImages: { readonly enabled: boolean };
  readonly favicon: { readonly enabled: boolean };
  readonly dateSources: readonly DateSource[];
}

interface ResolvedBuildConfig {
  readonly concurrency: number;
  readonly maxRetries: number;
}

interface ResolvedVaultDefaults {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly publicationMode: "exclusion" | "inclusion";
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
  readonly site: ResolvedSiteConfig;
  readonly discovery: ResolvedDiscoveryConfig;
  readonly mountPath: string;
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
  readonly publicationMode: "exclusion" | "inclusion";
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
  readonly site: ResolvedSiteConfig;
  readonly discovery: ResolvedDiscoveryConfig;
  /** Vault URL prefix within the host app, separate from SvelteKit's deployment base. */
  readonly mountPath: string;
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
  readonly href: string;
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
  readonly mountPath: string;
  readonly notes: readonly string[];
  readonly redirects: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  readonly folders: readonly string[];
  readonly feed: readonly string[];
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
 *   - after discoverFiles: `slug` is provisional (vault-relative, extensionless, case-normalized)
 *   - after parseFrontmatter: `frontmatter` is populated
 *   - after parseFrontmatter: `rawLinks` is populated
 *   - after allocateRoutes: `slug` is the unique canonical route key
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
  linkTargets?: Record<string, string>;
  createdAt?: Date;
  modifiedAt?: Date;
  gitCreatedAt?: Date;
  gitModifiedAt?: Date;
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
  readonly href: string;
  readonly path: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly page: {
    readonly toc: boolean;
    readonly comments: boolean;
  };
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly socialImage?: string;
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
  readonly favicon?: {
    readonly svg?: string;
    readonly png: string;
    readonly appleTouch: string;
    /** Small inlined icon for builds without a public site URL. */
    readonly inline: string;
  };
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
  DateSource,
  ResolvedDiscoveryConfig,
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
  ResolvedSiteConfig,
  ResolvedThemeConfig,
  ResolvedVaultDefaults,
  RouteIndex,
  SearchDocument,
  TargetConfig,
  TagIndexEntry,
  TocEntry,
};

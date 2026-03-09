import type { SvartzPlugin } from "../plugin/types";

/**
 * Current contract version. Themes and plugins declare a contractVersion;
 * the runner checks that semver major matches this constant.
 */
const CONTRACT_VERSION = "1.0.0" as const;

// --- Theme Component Loader ---

/**
 * Reference to a Svelte component — sync or lazy.
 *
 * Lazy: `() => Promise<{ default: Component }>` (dynamic import).
 * Sync: `{ default: Component }` (static import namespace or wrapper).
 */
type ThemeComponentLoader =
  | (() => Promise<{ default: unknown }>)
  | { readonly default: unknown };

// --- Theme Layout Map ---

/**
 * Maps named layout slots to component loaders.
 * Required: `defaultPage` and `notePage`.
 * Custom slots are extensible via the index signature.
 */
interface ThemeLayoutMap {
  readonly defaultPage: ThemeComponentLoader;
  readonly notePage: ThemeComponentLoader;
  readonly root?: ThemeComponentLoader;
  readonly tagPage?: ThemeComponentLoader;
  readonly folderPage?: ThemeComponentLoader;
  readonly feedPage?: ThemeComponentLoader;
  readonly notFoundPage?: ThemeComponentLoader;
  readonly [key: string]: ThemeComponentLoader | undefined;
}

// --- Theme Route Definition ---

interface ThemeRouteDefinition {
  readonly id: string;
  readonly pattern: string;
  readonly layoutSlot?: string;
  readonly component?: ThemeComponentLoader;
  readonly prerender?: boolean;
  readonly priority?: number;
  readonly meta?: Record<string, unknown>;
}

// --- Theme Component Registry ---

/**
 * Named component entries the theme provides for the runner/shell.
 * All entries are optional; custom components extend via the index signature.
 */
interface ThemeComponentRegistry {
  readonly callout?: ThemeComponentLoader;
  readonly backlinks?: ThemeComponentLoader;
  readonly graphPanel?: ThemeComponentLoader;
  readonly searchBox?: ThemeComponentLoader;
  readonly toc?: ThemeComponentLoader;
  readonly noteHeader?: ThemeComponentLoader;
  readonly [key: string]: ThemeComponentLoader | undefined;
}

// --- Theme Artifact Requirements ---

/**
 * Declares which pipeline artifacts the theme needs.
 * `search` and `toc` are derived from the canonical `index` — not independent.
 */
interface ThemeArtifactRequirements {
  readonly index?: boolean;
  readonly graph?: boolean;
  readonly backlinks?: boolean;
  readonly custom?: readonly string[];
}

// --- Theme Render Capabilities ---

/** Declarative flags indicating what the theme can render. */
interface ThemeRenderCapabilities {
  readonly callouts?: boolean;
  readonly wikilinks?: boolean;
  readonly embeds?: boolean;
  readonly codeBlocks?: boolean;
  readonly syntaxHighlighting?: boolean;
  readonly math?: boolean;
  readonly toc?: boolean;
  readonly backlinks?: boolean;
  readonly graph?: boolean;
  readonly search?: boolean;
}

// --- Theme Plugin Preset ---

/**
 * Plugins the theme ships with. Merged into the pipeline using standard
 * plugin merge semantics: replace by id if existing, append if new.
 */
interface ThemePluginPreset {
  readonly plugins?: readonly SvartzPlugin[];
}

// --- Main Theme Interface ---

interface SvartzTheme {
  readonly id: string;
  readonly version: string;
  readonly contractVersion: string;
  readonly layouts: ThemeLayoutMap;
  readonly routes: readonly ThemeRouteDefinition[];

  // Optional metadata
  readonly displayName?: string;
  readonly description?: string;
  readonly author?: string;
  readonly homepage?: string;

  // Optional functional sections
  readonly components?: ThemeComponentRegistry;
  readonly capabilities?: ThemeRenderCapabilities;
  readonly artifactRequirements?: ThemeArtifactRequirements;
  readonly pluginPreset?: ThemePluginPreset;
  readonly defaults?: Record<string, unknown>;
  readonly hooks?: Record<string, unknown>;
}

export { CONTRACT_VERSION };
export type {
  ThemeComponentLoader,
  ThemeLayoutMap,
  ThemeRouteDefinition,
  ThemeComponentRegistry,
  ThemeArtifactRequirements,
  ThemeRenderCapabilities,
  ThemePluginPreset,
  SvartzTheme,
};

import type {
  LinkResolutionStrategy,
  SvartzConfig,
  TargetConfig,
  VaultConfig,
} from "./config";
import type { TailwindThemeConfig } from "./tailwind";

// --- Resolved shared (no dependency on other Resolved*) ---

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

/** Resolved theme: base package name + optional theme.extend keys (Tailwind). */
type ResolvedThemeConfig = Readonly<
  { base: string } & Partial<TailwindThemeConfig>
>;

interface ResolvedBuildConfig {
  readonly concurrency: number;
  readonly maxRetries: number;
}

/** Resolved vault default options (no id, path, target). */
interface ResolvedVaultDefaults {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
}

// --- Resolved vault & config ---

interface ResolvedVaultConfig extends VaultConfig {
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedThemeConfig;
  readonly frontmatter: ResolvedFrontmatterConfig;
  readonly target: TargetConfig;
}

/** Resolved config: defaults are merged into each vault, so no top-level defaults or build. */
interface ResolvedSvartzConfig
  extends Omit<SvartzConfig, "defaults" | "vaults" | "build"> {
  readonly configDir: string;
  readonly vaults: readonly ResolvedVaultConfig[];
}

interface VaultSummary {
  readonly id: string;
  readonly path: string;
  readonly themeBase: string;
  readonly target: TargetConfig;
}

export {
  type ResolvedFrontmatterConfig,
  type ResolvedThemeConfig,
  type ResolvedBuildConfig,
  type ResolvedVaultDefaults,
  type ResolvedVaultConfig,
  type ResolvedSvartzConfig,
  type VaultSummary,
};

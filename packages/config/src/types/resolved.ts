import type {
  ResolvedBuildConfig,
  ResolvedConfig as CoreResolvedConfig,
  ResolvedFrontmatterConfig,
  ResolvedThemeConfig,
  ResolvedVaultDefaults,
} from "@svartz/core";
import type { SvartzConfig } from "./config";

/** Canonical single-vault resolved build config re-exported from @svartz/core. */
type ResolvedConfig = CoreResolvedConfig;

/**
 * Internal multi-vault resolved config set used by config resolution helpers.
 * Defaults are merged into each vault, while build defaults remain available here.
 */
interface ResolvedConfigSet
  extends Omit<SvartzConfig, "defaults" | "vaults" | "build"> {
  readonly configDir: string;
  readonly build: ResolvedBuildConfig;
  readonly vaults: readonly ResolvedConfig[];
}

/** Compatibility alias for code that still refers to a resolved vault. */
type ResolvedVaultConfig = ResolvedConfig;
/** Compatibility alias for code that still refers to the multi-vault bundle. */
type ResolvedSvartzConfig = ResolvedConfigSet;

export {
  type ResolvedBuildConfig,
  type ResolvedConfig,
  type ResolvedConfigSet,
  type ResolvedFrontmatterConfig,
  type ResolvedThemeConfig,
  type ResolvedVaultConfig,
  type ResolvedVaultDefaults,
  type ResolvedSvartzConfig,
};

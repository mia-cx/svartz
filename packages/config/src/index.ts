import { Effect, Either } from "effect";
import {
  loadConfigEffect as loadConfigProgram,
  decodeConfigEffect as decodeConfigProgram,
} from "./loader.js";
import {
  resolveConfigPathsEffect as resolveConfigPathsProgram,
  getVaultEffect as getVaultProgram,
  listVaults as listVaultsPure,
} from "./resolver.js";
import type {
  SvartzConfig,
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  VaultSummary,
} from "./types.js";

// --- Re-exports: types ---

export type {
  SvartzConfig,
  SvartzDefaults,
  VaultConfig,
  VaultThemeConfig,
  TargetConfig,
  LinkResolutionStrategy,
  FrontmatterFields,
  TailwindThemeConfig,
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  ResolvedFrontmatter,
  ResolvedTheme,
  ResolvedBuildDefaults,
  VaultSummary,
  ConfigError,
} from "./types.js";

// --- Re-exports: tagged error classes ---

export {
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
  VaultPathInvalid,
  VaultIdNotFound,
} from "./types.js";

// --- Re-exports: schemas ---

export {
  SemverSchema,
  SvartzConfigSchema,
  VaultConfigSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  FrontmatterFieldsSchema,
  SvartzDefaultsSchema,
  LinkResolutionStrategySchema,
  TailwindThemeConfigSchema,
} from "./schema.js";

// --- Effect programs (for consumers who use Effect directly) ---

export { loadConfigProgram as loadConfigEffect };
export { decodeConfigProgram as decodeConfigEffect };
export { resolveConfigPathsProgram as resolveConfigPathsEffect };
export { getVaultProgram as getVaultEffect };

// --- Boundary adapter ---

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });

// --- Promise-based public API ---

export const loadConfig = (
  configPath?: string,
): Promise<{ config: SvartzConfig; configDir: string }> =>
  runEffect(loadConfigProgram(configPath));

export const decodeConfig = (raw: unknown): Promise<SvartzConfig> =>
  runEffect(decodeConfigProgram(raw));

export const resolveConfigPaths = (
  config: SvartzConfig,
  configDir: string,
): Promise<ResolvedSvartzConfig> =>
  runEffect(resolveConfigPathsProgram(config, configDir));

export const getVault = (
  config: ResolvedSvartzConfig,
  vaultId: string,
): Promise<ResolvedVaultConfig> =>
  runEffect(getVaultProgram(config, vaultId));

export const listVaults = (config: ResolvedSvartzConfig): VaultSummary[] =>
  listVaultsPure(config);

export const defineConfig = (config: SvartzConfig): SvartzConfig => config;

import { Effect, Either } from "effect";
import {
  loadConfig as loadConfigEffect,
  parseConfig as parseConfigEffect,
} from "./loader";
import {
  getVaultConfig as getVaultConfigEffect,
  resolveConfig as resolveConfigEffect,
} from "./resolver";
import type {
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  SvartzConfig,
} from "./types";

export * from "./schemas";
export * from "./types";
export type {
  ResolvedBuildConfig as ResolvedBuildDefaults,
  ResolvedFrontmatterConfig as ResolvedFrontmatter,
  ResolvedThemeConfig as ResolvedTheme,
} from "./types";
export * from "./utils";

// --- Effect programs (for consumers who use Effect directly) ---

export { loadConfigEffect, parseConfigEffect, resolveConfigEffect };

// --- Boundary adapter ---

export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });

// --- Promise-based public API ---

export const loadConfig = (
  configPath?: string,
): Promise<ResolvedSvartzConfig> => runEffect(loadConfigEffect(configPath));

export const parseConfig = (raw: unknown): Promise<SvartzConfig> =>
  runEffect(parseConfigEffect(raw));

export const resolveConfig = (
  config: SvartzConfig,
  configDir: string,
): Promise<ResolvedSvartzConfig> =>
  runEffect(resolveConfigEffect(config, configDir));

export const getVault = (
  config: ResolvedSvartzConfig,
  vaultId: string,
): Promise<ResolvedVaultConfig> =>
  runEffect(getVaultConfigEffect(config, vaultId));

export const defineConfig = (config: SvartzConfig): SvartzConfig => config;

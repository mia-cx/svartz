import {
  mergePlugins,
  normalizePlugin,
  SECRET_ENV_NAME_PATTERN,
  SERVER_PLUGIN_ID_PATTERN,
  THEME_FEATURE_STAGES,
  type NormalizedSvartzPlugin,
  type ResolvedConfig,
  type StageName,
  type SvartzPlugin,
  type SvartzTheme,
} from "@svartz/core";
import { createCorePlugins } from "@svartz/plugins";

const REQUIRED_STAGES = [
  "discoverFiles",
  "parseFrontmatter",
  "filterUnpublished",
  "allocateRoutes",
  "resolveLinks",
  "indexContent",
  "emitArtifacts",
] as const satisfies readonly StageName[];

function getThemePresetPlugins(theme: SvartzTheme | undefined): readonly SvartzPlugin[] {
  return theme?.pluginPreset?.plugins ?? [];
}

function assertRequiredStages(
  plugins: readonly NormalizedSvartzPlugin[],
): void {
  const missingStages = REQUIRED_STAGES.filter((stage) =>
    !plugins.some((plugin) => plugin[stage]),
  );

  if (missingStages.length === 0) return;

  const formatted = missingStages.map((stage) => `\`${stage}\``).join(", ");
  throw new Error(
    `Required pipeline stage(s) ${formatted} have no plugin.`,
  );
}

function assertThemeRequirements(
  theme: SvartzTheme | undefined,
  plugins: readonly NormalizedSvartzPlugin[],
): void {
  if (!theme?.requiredFeatures) return;
  const missing = theme.requiredFeatures.filter((feature) =>
    !plugins.some((plugin) => plugin[THEME_FEATURE_STAGES[feature]]),
  );
  if (missing.length === 0) return;
  throw new Error(`Theme "${theme.id}" requires disabled feature(s): ${missing.join(", ")}.`);
}

const SERVER_TARGETS = ["cloudflare-workers", "cloudflare-pages", "node"] as const;

/** Why a server plugin's options can't ship, or `undefined` when they are JSON with valid `{ env }` references. */
function serverOptionsProblem(value: unknown, path: string): string | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") return Number.isFinite(value) ? undefined : `${path} must be a finite number`;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const problem = serverOptionsProblem(item, `${path}[${index}]`);
      if (problem) return problem;
    }
    return;
  }
  const prototype: unknown = typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    return `${path} must be JSON: a string, number, boolean, null, array or plain object`;
  }
  const record = value as Record<string, unknown>;
  if ("env" in record) {
    const keys = Object.keys(record);
    if (keys.length !== 1 || typeof record.env !== "string") return `${path} names a secret, so it must be exactly { env: "NAME" }`;
    if (!SECRET_ENV_NAME_PATTERN.test(record.env)) {
      return `${path} names "${record.env}"; secrets need a server-only variable name, not PUBLIC_ or VITE_`;
    }
    return;
  }
  for (const [key, item] of Object.entries(record)) {
    const problem = serverOptionsProblem(item, `${path}.${key}`);
    if (problem) return problem;
  }
}

/** A server plugin needs a server target, a path-segment id, an importable module and JSON options. */
function assertServerPlugins(config: ResolvedConfig, plugins: readonly NormalizedSvartzPlugin[]): void {
  for (const { id, server } of plugins) {
    if (!server) continue;
    const target = config.target.type;
    if (target === "host") {
      throw new Error(`Vault "${config.id}" is a host vault, but plugin "${id}" serves requests, which host apps can't route yet.`);
    }
    if (!(SERVER_TARGETS as readonly string[]).includes(target)) {
      throw new Error(`Vault "${config.id}" targets "${target}", but plugin "${id}" serves requests. Use a server target (${SERVER_TARGETS.join(", ")}) or disable the plugin.`);
    }
    if (!SERVER_PLUGIN_ID_PATTERN.test(id)) {
      throw new Error(`Plugin "${id}" serves requests under /_svartz/<id>/, so its id may hold only lowercase letters, digits and hyphens.`);
    }
    if (server.module.startsWith(".")) {
      throw new Error(`Plugin "${id}" server module "${server.module}" is relative; use an absolute path, a file: URL or a package name.`);
    }
    const problem = serverOptionsProblem(server.options ?? null, "server.options");
    if (problem) throw new Error(`Plugin "${id}": ${problem}.`);
  }
}

/**
 * Merge runtime plugins in specificity order.
 * `config.plugins` is already the defaults→vault merge from @svartz/config.
 */
function resolveRuntimePlugins(
  config: ResolvedConfig,
  theme?: SvartzTheme,
): NormalizedSvartzPlugin[] {
  const merged = mergePlugins(
    createCorePlugins(),
    getThemePresetPlugins(theme),
    config.plugins as readonly SvartzPlugin[],
  );

  const normalized = merged.map((plugin) => normalizePlugin(plugin as SvartzPlugin));
  assertRequiredStages(normalized);
  assertThemeRequirements(theme, normalized);
  assertServerPlugins(config, normalized);
  return normalized;
}

export { assertRequiredStages, assertServerPlugins, assertThemeRequirements, getThemePresetPlugins, resolveRuntimePlugins };

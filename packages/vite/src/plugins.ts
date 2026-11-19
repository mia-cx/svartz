import {
  mergePlugins,
  normalizePlugin,
  PAGE_ROUTE_SEGMENT,
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

const STATIC_ADAPTER = "@sveltejs/adapter-static";

/**
 * A server plugin needs a server target (or a host app whose adapter isn't `adapter-static`), a path-segment id,
 * an importable module and JSON options. `hostAdapter` is the host's `kit.adapter.name`.
 */
function assertServerPlugins(
  config: ResolvedConfig,
  plugins: readonly NormalizedSvartzPlugin[],
  hostAdapter?: string,
): void {
  for (const { id, server } of plugins) {
    if (!server) continue;
    const target = config.target.type;
    // Pages render per request too, so they need a server just as requests do.
    const serves = Array.isArray(server.pages) && server.pages.length > 0 ? "serves pages" : "serves requests";
    if (target === "host" && hostAdapter === STATIC_ADAPTER) {
      throw new Error(`Vault "${config.id}" is mounted in a host app that uses ${STATIC_ADAPTER}, but plugin "${id}" ${serves}. Use a server adapter, such as @sveltejs/adapter-node or @sveltejs/adapter-cloudflare, or disable the plugin.`);
    }
    if (target !== "host" && !(SERVER_TARGETS as readonly string[]).includes(target)) {
      throw new Error(`Vault "${config.id}" targets "${target}", but plugin "${id}" ${serves}. Use a server target (${SERVER_TARGETS.join(", ")}) or disable the plugin.`);
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
  assertPluginPages(config, plugins);
}

/** Page names are URL path segments, and each one belongs to one plugin on the vault. */
function assertPluginPages(config: ResolvedConfig, plugins: readonly NormalizedSvartzPlugin[]): void {
  const owners = new Map<string, string>();
  for (const { id, server } of plugins) {
    const pages: unknown = server?.pages ?? [];
    if (!Array.isArray(pages)) throw new Error(`Plugin "${id}": server.pages must list page names, such as ["account"].`);
    for (const name of pages) {
      if (typeof name !== "string" || !SERVER_PLUGIN_ID_PATTERN.test(name)) {
        throw new Error(`Plugin "${id}" claims page ${JSON.stringify(name)} under /${PAGE_ROUTE_SEGMENT}/; a page name may hold only lowercase letters, digits and hyphens.`);
      }
      const owner = owners.get(name);
      if (owner) throw new Error(`Vault "${config.id}": plugins "${owner}" and "${id}" both claim the page /${PAGE_ROUTE_SEGMENT}/${name}/.`);
      owners.set(name, id);
    }
  }
}

/** Whether any active plugin renders pages under `/-/`. */
function hasPluginPages(plugins: readonly NormalizedSvartzPlugin[]): boolean {
  return plugins.some(({ server }) => Boolean(server?.pages?.length));
}

/**
 * Plugin pages own `<mount>/-/`, so a published note there would be shadowed at runtime. Fail the build naming it.
 * `routes` are the vault's published routes, mount path included.
 */
function assertNoNotesUnderPages(config: ResolvedConfig, plugins: readonly NormalizedSvartzPlugin[], routes: readonly string[]): void {
  if (!hasPluginPages(plugins)) return;
  const prefix = `${config.mountPath}/${PAGE_ROUTE_SEGMENT}/`;
  const shadowed = routes.find((route) => route.startsWith(prefix));
  if (shadowed) {
    throw new Error(`Vault "${config.id}" publishes ${shadowed}, but plugin pages own ${prefix}. Rename the note's folder or slug.`);
  }
}

/**
 * Merge runtime plugins in specificity order.
 * `config.plugins` is already the defaults→vault merge from @svartz/config.
 * `hostAdapter` is the host app's `kit.adapter.name` when the vault targets `host`.
 */
function resolveRuntimePlugins(
  config: ResolvedConfig,
  theme?: SvartzTheme,
  hostAdapter?: string,
): NormalizedSvartzPlugin[] {
  const merged = mergePlugins(
    createCorePlugins(),
    getThemePresetPlugins(theme),
    config.plugins as readonly SvartzPlugin[],
  );

  const normalized = merged.map((plugin) => normalizePlugin(plugin as SvartzPlugin));
  assertRequiredStages(normalized);
  assertThemeRequirements(theme, normalized);
  assertServerPlugins(config, normalized, hostAdapter);
  return normalized;
}

export {
  assertNoNotesUnderPages,
  assertRequiredStages,
  assertServerPlugins,
  assertThemeRequirements,
  getThemePresetPlugins,
  hasPluginPages,
  resolveRuntimePlugins,
};

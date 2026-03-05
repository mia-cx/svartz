import type {
  SvartzPlugin,
  NormalizedSvartzPlugin,
  PluginHook,
  PluginChangeHook,
  StageName,
} from "./types";
import { STAGE_NAMES } from "./types";
import { PluginValidationError } from "./errors";

const VALID_ENFORCE = new Set(["pre", "post", undefined]);

function normalizeHook(
  hook: SvartzPlugin[StageName],
  pluginId: string,
  stage: string,
): PluginHook | undefined {
  if (hook == null) return undefined;

  if (typeof hook === "function") {
    return { run: hook, options: {} };
  }

  if (typeof hook === "object" && typeof hook.run === "function") {
    validateHookOptions(hook.options, pluginId, stage);
    return hook;
  }

  throw new PluginValidationError({
    pluginId,
    message: `Hook "${stage}" must be a function or { run, options? }`,
  });
}

function normalizeChangeHook(
  hook: SvartzPlugin["handleChange"],
  pluginId: string,
): PluginChangeHook | undefined {
  if (hook == null) return undefined;

  if (typeof hook === "function") {
    return { run: hook, options: {} };
  }

  if (typeof hook === "object" && typeof hook.run === "function") {
    validateHookOptions(hook.options, pluginId, "handleChange");
    return hook;
  }

  throw new PluginValidationError({
    pluginId,
    message: `Hook "handleChange" must be a function or { run, options? }`,
  });
}

function validateHookOptions(
  options: PluginHook["options"],
  pluginId: string,
  stage: string,
): void {
  if (!options) return;

  if (!VALID_ENFORCE.has(options.enforce)) {
    throw new PluginValidationError({
      pluginId,
      message: `Hook "${stage}" has invalid enforce value "${String(options.enforce)}"; expected "pre", "post", or undefined`,
    });
  }

  if (options.parallel !== undefined && typeof options.parallel !== "boolean") {
    throw new PluginValidationError({
      pluginId,
      message: `Hook "${stage}" has invalid parallel value; expected boolean`,
    });
  }
}

const KNOWN_KEYS = new Set<string>([
  "id",
  "disabled",
  ...STAGE_NAMES,
  "handleChange",
]);

function warnUnknownKeys(plugin: SvartzPlugin): void {
  for (const key of Object.keys(plugin)) {
    if (!KNOWN_KEYS.has(key)) {
      console.warn(
        `[svartz:plugin] plugin "${plugin.id}" has unknown key "${key}"`,
      );
    }
  }
}

/**
 * Normalize a plugin: convert function shorthand hooks to object form
 * and validate hook shapes/options. Throws on invalid plugins.
 */
function normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin {
  if (!plugin.id || typeof plugin.id !== "string") {
    throw new PluginValidationError({
      pluginId: plugin.id ?? "<missing>",
      message: `Plugin id must be a non-empty string`,
    });
  }

  warnUnknownKeys(plugin);

  if (plugin.disabled && hasHooks(plugin)) {
    console.warn(
      `[svartz:plugin] plugin "${plugin.id}" is disabled but has hooks defined; hooks will be ignored`,
    );
  }

  const normalized: NormalizedSvartzPlugin = {
    id: plugin.id,
    ...(plugin.disabled !== undefined && { disabled: plugin.disabled }),

    // Lifecycle hooks
    buildStart: normalizeHook(plugin.buildStart, plugin.id, "buildStart"),
    configResolved: normalizeHook(
      plugin.configResolved,
      plugin.id,
      "configResolved",
    ),
    buildEnd: normalizeHook(plugin.buildEnd, plugin.id, "buildEnd"),
    handleChange: normalizeChangeHook(plugin.handleChange, plugin.id),

    // Pipeline hooks
    discoverFiles: normalizeHook(
      plugin.discoverFiles,
      plugin.id,
      "discoverFiles",
    ),
    parseFrontmatter: normalizeHook(
      plugin.parseFrontmatter,
      plugin.id,
      "parseFrontmatter",
    ),
    filterUnpublished: normalizeHook(
      plugin.filterUnpublished,
      plugin.id,
      "filterUnpublished",
    ),
    resolveLinks: normalizeHook(
      plugin.resolveLinks,
      plugin.id,
      "resolveLinks",
    ),
    transformOfm: normalizeHook(plugin.transformOfm, plugin.id, "transformOfm"),
    transformGfm: normalizeHook(plugin.transformGfm, plugin.id, "transformGfm"),
    transformToc: normalizeHook(plugin.transformToc, plugin.id, "transformToc"),
    transformDescription: normalizeHook(
      plugin.transformDescription,
      plugin.id,
      "transformDescription",
    ),
    transformSyntax: normalizeHook(
      plugin.transformSyntax,
      plugin.id,
      "transformSyntax",
    ),
    transformLatex: normalizeHook(
      plugin.transformLatex,
      plugin.id,
      "transformLatex",
    ),
    indexContent: normalizeHook(plugin.indexContent, plugin.id, "indexContent"),
    emitArtifacts: normalizeHook(
      plugin.emitArtifacts,
      plugin.id,
      "emitArtifacts",
    ),
  };

  return normalized;
}

function hasHooks(plugin: SvartzPlugin): boolean {
  return STAGE_NAMES.some((s) => plugin[s] != null) ||
    plugin.handleChange != null;
}

function isPluginEnabled(plugin: SvartzPlugin): boolean {
  return plugin.disabled !== true;
}

/**
 * Sort normalized plugins for a specific stage by enforce tier.
 * Within each tier, config array order is preserved (stable sort).
 * Only returns plugins that have a hook for the given stage.
 */
function sortPluginsForStage(
  plugins: readonly NormalizedSvartzPlugin[],
  stage: StageName,
): NormalizedSvartzPlugin[] {
  const withHook = plugins.filter((p) => p[stage] != null);

  const tierOf = (p: NormalizedSvartzPlugin): number => {
    const enforce = p[stage]?.options?.enforce;
    if (enforce === "pre") return 0;
    if (enforce === "post") return 2;
    return 1;
  };

  return withHook.sort((a, b) => tierOf(a) - tierOf(b));
}

export { normalizePlugin, isPluginEnabled, sortPluginsForStage };

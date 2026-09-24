import {
  mergePlugins,
  normalizePlugin,
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
  return normalized;
}

export { assertRequiredStages, getThemePresetPlugins, resolveRuntimePlugins };

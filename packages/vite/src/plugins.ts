import {
  mergePlugins,
  normalizePlugin,
  type NormalizedSvartzPlugin,
  type ResolvedConfig,
  type SvartzPlugin,
  type SvartzTheme,
} from "@svartz/core";
import { CORE_PLUGIN_IDS, createCorePlugins } from "@svartz/plugins";

function getThemePresetPlugins(theme: SvartzTheme | undefined): readonly SvartzPlugin[] {
  return theme?.pluginPreset?.plugins ?? [];
}

function assertRequiredCorePlugins(
  plugins: readonly { readonly id: string }[],
): void {
  const activeIds = new Set(plugins.map((plugin) => plugin.id));
  const missingCorePlugins = CORE_PLUGIN_IDS.filter((id) => !activeIds.has(id));

  if (missingCorePlugins.length === 0) return;

  const formatted = missingCorePlugins.map((id) => `\`${id}\``).join(", ");
  throw new Error(
    `core plugin(s) ${formatted} are disabled, but required for build.`,
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

  assertRequiredCorePlugins(merged);

  return merged.map((plugin) => normalizePlugin(plugin as SvartzPlugin));
}

export { assertRequiredCorePlugins, getThemePresetPlugins, resolveRuntimePlugins };

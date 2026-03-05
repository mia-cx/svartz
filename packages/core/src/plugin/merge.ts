import type { SvartzPlugin } from "./types";

/**
 * Deduplicate plugins by id within a single list.
 * On duplicate: warn, last wins (keeps last occurrence's position).
 */
function dedupePlugins(plugins: readonly SvartzPlugin[]): SvartzPlugin[] {
  const seen = new Map<string, number>();
  const result: SvartzPlugin[] = [];

  for (const plugin of plugins) {
    const existingIdx = seen.get(plugin.id);
    if (existingIdx !== undefined) {
      console.warn(
        `[svartz:plugin] duplicate plugin id "${plugin.id}" in same list; last wins`,
      );
      result[existingIdx] = plugin;
    } else {
      seen.set(plugin.id, result.length);
      result.push(plugin);
    }
  }

  return result;
}

/**
 * Layered merge of default and vault plugin lists.
 *
 * 1. Normalize each list (dedupe by id, last wins)
 * 2. Base: normalized defaults
 * 3. Apply vault overrides:
 *    - same id → replace in-place (keeps position)
 *    - new id → append
 * 4. Remove disabled entries
 */
function mergePlugins(
  defaultPlugins: readonly SvartzPlugin[],
  vaultPlugins: readonly SvartzPlugin[],
): SvartzPlugin[] {
  const normalizedDefaults = dedupePlugins(defaultPlugins);
  const normalizedVault = dedupePlugins(vaultPlugins);

  const result = [...normalizedDefaults];
  const idxMap = new Map(result.map((p, i) => [p.id, i]));

  for (const plugin of normalizedVault) {
    const existingIdx = idxMap.get(plugin.id);
    if (existingIdx !== undefined) {
      result[existingIdx] = plugin;
    } else {
      idxMap.set(plugin.id, result.length);
      result.push(plugin);
    }
  }

  return result.filter((p) => p.disabled !== true);
}

export { mergePlugins };

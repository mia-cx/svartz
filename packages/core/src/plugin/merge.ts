type MergeablePlugin = {
  readonly id: string;
  readonly disabled?: boolean;
};

/**
 * Deduplicate plugins by id within a single list.
 * On duplicate: warn, last wins (keeps last occurrence's position).
 */
function dedupePlugins<T extends MergeablePlugin>(plugins: readonly T[]): T[] {
  const seen = new Map<string, number>();
  const result: T[] = [];

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

function normalizeMergeLayers<T extends MergeablePlugin>(
  firstLayer: readonly T[] | readonly (readonly T[])[],
  restLayers: readonly (readonly T[])[],
): readonly (readonly T[])[] {
  if (restLayers.length === 0) {
    const maybeLayers = firstLayer as readonly unknown[];
    if (Array.isArray(maybeLayers[0])) {
      return firstLayer as readonly (readonly T[])[];
    }
  }

  return [firstLayer as readonly T[], ...restLayers];
}

/**
 * Layered merge of plugin lists.
 *
 * 1. Normalize each layer (dedupe by id, last wins)
 * 2. Apply layers from least specific to most specific
 * 3. same id → replace in-place (keeps original position)
 * 4. new id → append
 * 5. disabled plugins are removed from final output
 */
function mergePlugins<T extends MergeablePlugin>(
  baseLayer: readonly T[],
  overrideLayer: readonly T[],
): T[];
function mergePlugins<T extends MergeablePlugin>(
  ...layers: readonly (readonly T[])[]
): T[];
function mergePlugins<T extends MergeablePlugin>(
  firstLayer: readonly T[] | readonly (readonly T[])[],
  ...restLayers: readonly (readonly T[])[]
): T[] {
  const layers = normalizeMergeLayers(firstLayer, restLayers);
  const result: T[] = [];
  const indices = new Map<string, number>();

  for (const layer of layers) {
    const normalizedLayer = dedupePlugins(layer);

    for (const plugin of normalizedLayer) {
      const existingIdx = indices.get(plugin.id);
      if (existingIdx !== undefined) {
        result[existingIdx] = plugin;
      } else {
        indices.set(plugin.id, result.length);
        result.push(plugin);
      }
    }
  }

  return result.filter((plugin) => plugin.disabled !== true);
}

export { mergePlugins };

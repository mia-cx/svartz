/**
 * Vite aliases that point each workspace theme at its source, by exact id.
 * A string alias also captures subpaths, so `@svartz/theme-minimal` would
 * rewrite another listed theme's `@svartz/theme-minimal/runtime` import.
 */
export const themeSourceAliases = (sources: Readonly<Record<string, string>>) =>
  Object.entries(sources).map(([id, source]) => ({
    find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`),
    replacement: source,
  }));

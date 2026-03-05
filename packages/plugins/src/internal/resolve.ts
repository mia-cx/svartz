/**
 * Link resolution utilities — ported from @svartz/vault indexer.ts.
 * Deterministic tie-break: shared depth -> path depth -> lexicographic.
 */

import type { RawLink, LinkResolutionStrategy } from "@svartz/core";
import { fileToSlug } from "./slug";

const sharedDepth = (a: string, b: string): number => {
  const aParts = a.split("/");
  const bParts = b.split("/");
  let depth = 0;
  while (
    depth < aParts.length - 1 &&
    depth < bParts.length - 1 &&
    aParts[depth] === bParts[depth]
  ) {
    depth++;
  }
  return depth;
};

const byPathDepth = (a: string, b: string) =>
  a.split("/").length - b.split("/").length;

export const resolveLink = (
  link: RawLink,
  slugMap: Record<string, string>,
  allSlugs: readonly string[],
  strategy: LinkResolutionStrategy,
  sourceSlug: string,
): string | null => {
  const target = link.target.trim();
  if (!target) return null;

  const normalized = fileToSlug(target);

  if (slugMap[normalized] !== undefined) return slugMap[normalized]!;

  if (strategy === "absolute") return null;

  const baseName = normalized.split("/").pop();
  if (!baseName) return null;

  const candidates = allSlugs.filter(
    (slug) => slug.split("/").pop() === baseName,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  if (strategy === "closest") {
    return [...candidates].sort((a, b) => {
      const depthDiff = sharedDepth(sourceSlug, b) - sharedDepth(sourceSlug, a);
      if (depthDiff !== 0) return depthDiff;
      const depth = byPathDepth(a, b);
      return depth !== 0 ? depth : a.localeCompare(b);
    })[0]!;
  }

  // shallowest
  return [...candidates].sort(
    (a, b) => byPathDepth(a, b) || a.localeCompare(b),
  )[0]!;
};

/**
 * Build a slug resolution map from all files' slugs and aliases.
 * Alias collisions are excluded from the map (ambiguous).
 */
export const buildSlugMap = (
  entries: ReadonlyArray<{ slug: string; aliases?: readonly string[] }>,
): Record<string, string> => {
  const map: Record<string, string> = {};
  const ambiguousBasenames = new Set<string>();
  const ambiguousAliases = new Set<string>();
  const canonicalSlugs = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.slug.toLowerCase();
    canonicalSlugs.add(normalized);
    map[normalized] = entry.slug;
  }

  for (const entry of entries) {
    const baseName = entry.slug.split("/").pop();
    if (baseName && baseName !== entry.slug) {
      const normalized = baseName.toLowerCase();
      if (ambiguousBasenames.has(normalized)) continue;
      if (map[normalized] === undefined) {
        map[normalized] = entry.slug;
      } else if (map[normalized] !== entry.slug) {
        if (!canonicalSlugs.has(normalized)) {
          delete map[normalized];
        }
        ambiguousBasenames.add(normalized);
      }
    }

    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const normalizedAlias = alias.toLowerCase();
        if (ambiguousAliases.has(normalizedAlias)) continue;
        const existing = map[normalizedAlias];
        if (existing !== undefined && existing !== entry.slug) {
          delete map[normalizedAlias];
          ambiguousAliases.add(normalizedAlias);
          continue;
        }
        if (existing === undefined) {
          map[normalizedAlias] = entry.slug;
        }
      }
    }
  }

  return map;
};

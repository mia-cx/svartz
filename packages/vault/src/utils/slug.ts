import { Effect } from "effect";
import type { SlugMap } from "../types.js";
import { SlugConflict } from "../types.js";

interface SlugSource {
  slug?: string;
  aliases?: string[];
}

/**
 * Normalize a text segment to a slug-safe form.
 * Replaces special characters with hyphens, collapses consecutive hyphens, and lowercases.
 * Used for both file paths and link text normalization.
 */
export const normalizeSlugSegment = (segment: string): string =>
  segment
    .replace(/\s/g, "-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent")
    .replace(/\?/g, "")
    .replace(/#/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

const sluggifySegment = normalizeSlugSegment;

/**
 * Convert a vault-relative file path to a canonical slug.
 * Quartz reference: packages/reference/quartz/util/path.ts — slugifyFilePath()
 */
export const fileToSlug = (filePath: string): string => {
  const withoutExt = filePath.replace(/\.[^.]+$/, "");
  const slug = withoutExt
    .split("/")
    .map(sluggifySegment)
    .join("/")
    .replace(/\/$/, "");

  if (slug.endsWith("_index")) {
    return slug.replace(/_index$/, "index");
  }

  return slug;
};

export const deriveTitle = (filename: string): string =>
  filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Build a slug resolution map from all entries' slugs and aliases.
 * Returns Effect that fails with SlugConflict only on duplicate canonical slugs.
 * Aliases that map to more than one slug are omitted from the map (ambiguous, no resolution).
 */
export const buildSlugMap = (
  entries: SlugSource[],
): Effect.Effect<SlugMap, SlugConflict> =>
  Effect.gen(function* () {
    const canonicalSlugs = new Set<string>();
    const map: SlugMap = {};

    for (const entry of entries) {
      if (!entry.slug) continue;

      const normalized = entry.slug.toLowerCase();
      if (canonicalSlugs.has(normalized)) {
        return yield* new SlugConflict({
          slug: entry.slug,
          message: `Two files resolve to the same slug: "${entry.slug}"`,
        });
      }
      canonicalSlugs.add(normalized);
      map[normalized] = entry.slug;
    }

    const ambiguousBasenames = new Set<string>();
    const ambiguousAliases = new Set<string>();

    for (const entry of entries) {
      if (!entry.slug) continue;

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
  });

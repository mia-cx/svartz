/**
 * Slug normalization — ported from @svartz/vault slug.ts.
 * Kept Effect-free for plugin authors.
 *
 * Determinism guarantees:
 *   - Canonical slugs are full vault-relative path segments, lowercased, extensionless.
 *   - Two files at different paths never produce the same canonical slug.
 */

const normalizeSlugSegment = (segment: string): string =>
  segment
    .replace(/\s/g, "-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent")
    .replace(/\?/g, "")
    .replace(/#/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

export const fileToSlug = (filePath: string): string => {
  const withoutExt = filePath.replace(/\.[^.]+$/, "");
  const slug = withoutExt
    .split("/")
    .map(normalizeSlugSegment)
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

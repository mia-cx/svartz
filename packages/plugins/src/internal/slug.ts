/**
 * Slug normalization — ported from @svartz/vault slug.ts.
 * Kept Effect-free for plugin authors.
 *
 * Determinism guarantees:
 *   - Canonical slugs are full vault-relative path segments, lowercased, extensionless.
 *   - Two files at different paths never produce the same canonical slug.
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

/**
 * Whether the file at vault-relative `filePath` is its folder's own note: `index`, `_index`, or one named after its
 * folder (`Guides/Guides.md`), as Obsidian's folder notes are. A folder note owns its folder's URL and title.
 */
export const isFolderNote = (filePath: string): boolean => {
  const segments = filePath.replaceAll("\\", "/").split("/");
  const stem = segments.pop()!.replace(/\.[^.]+$/, "");
  const folder = segments.at(-1);
  if (/^_?index$/i.test(stem)) return true;
  return folder !== undefined && normalizeSlugSegment(stem) === normalizeSlugSegment(folder);
};

/** A note's title is its filename as written, as in Obsidian. */
export const deriveTitle = (filename: string): string => filename.trim();

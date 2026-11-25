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

/** {@link folderNoteRank} of a file that isn't a folder note. */
const NOT_FOLDER_NOTE = 3;

/**
 * How strongly the file at vault-relative `filePath` claims its folder: `index` 0, `_index` 1, a note named exactly
 * after its folder (`Guides/Guides.md`) 2, as Obsidian's folder notes are, and any other file not at all. When one
 * folder holds several, the lowest takes the folder's URL, title and `order`; the rest take numbered URLs.
 */
export const folderNoteRank = (filePath: string): number => {
  const segments = filePath.replaceAll("\\", "/").split("/");
  const stem = segments.pop()!.replace(/\.[^.]+$/, "");
  if (/^index$/i.test(stem)) return 0;
  if (/^_index$/i.test(stem)) return 1;
  return stem === segments.at(-1) ? 2 : NOT_FOLDER_NOTE;
};

/** Whether the file at vault-relative `filePath` is its folder's own note: see {@link folderNoteRank}. */
export const isFolderNote = (filePath: string): boolean => folderNoteRank(filePath) < NOT_FOLDER_NOTE;

/** A note's title is its filename as written, as in Obsidian. */
export const deriveTitle = (filename: string): string => filename.trim();

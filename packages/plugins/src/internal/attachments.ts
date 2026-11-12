/**
 * How a note names an attachment, and how an attachment embed renders: shared by the build and the browser preview,
 * so it imports no Node built-ins.
 */
import { basename, dirname, join, normalize } from "pathe";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm", ".3gp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".ogv", ".webm"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

/** The path a link target names, decoded and without `?query` or `#fragment`; undefined for an external URL. */
function attachmentTarget(target: string): string | undefined {
  const path = target.split(/[?#]/, 1)[0]?.trim();
  if (!path || /^(?:[a-z]+:|\/\/)/i.test(path)) return;
  try {
    return decodeURIComponent(path).replaceAll("\\", "/");
  } catch {
    return path.replaceAll("\\", "/");
  }
}

/**
 * Resolve a link from the note at `notePath` to one of `paths`, the vault's attachments: from the note's folder, then
 * as a vault path, then by a file name no other attachment has. A target starting with `/` tries the vault path first.
 * Case-insensitive, as Obsidian matches. `sharedNames` are file names that files outside `paths` also have, so they
 * never resolve by name alone.
 */
export function attachmentResolver(
  paths: readonly string[],
  sharedNames: readonly string[] = [],
): (notePath: string, raw: string) => string | undefined {
  const byPath = new Map(paths.map((path) => [path.toLowerCase(), path]));
  const byName = new Map<string, string>();
  const ambiguousNames = new Set(sharedNames.map((name) => name.toLowerCase()));
  for (const path of paths) {
    const name = basename(path).toLowerCase();
    if (ambiguousNames.has(name)) continue;
    if (byName.has(name)) {
      byName.delete(name);
      ambiguousNames.add(name);
    } else {
      byName.set(name, path);
    }
  }

  return (notePath, raw) => {
    const target = attachmentTarget(raw);
    if (!target) return;
    const vaultPath = target.replace(/^\/+/, "");
    const relativePath = normalize(join(dirname(notePath), target));
    return (target.startsWith("/") ? byPath.get(vaultPath.toLowerCase()) : undefined) ??
      byPath.get(relativePath.toLowerCase()) ??
      byPath.get(vaultPath.toLowerCase()) ??
      byName.get(basename(vaultPath).toLowerCase());
  };
}

/** `Assets/my chart.png` → `Assets/my%20chart.png`: each segment percent-encoded, as attachment URLs are. */
export const encodeAttachmentPath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

/** The `?query` or `#fragment` an authored link target ends with, which its resolved URL keeps. */
export const urlSuffix = (target: string): string => /[?#].*$/.exec(target)?.[0] ?? "";

/** `![[target#section|alias]]`'s parts, trimmed. */
export function splitEmbedInner(inner: string): { target: string; section?: string; alias?: string } {
  const [targetWithSection, ...labelParts] = inner.split("|");
  const alias = labelParts.length > 0 ? labelParts.join("|").trim() : undefined;
  const [target, section] = targetWithSection!.split("#");
  return {
    target: target?.trim() ?? "",
    section: section?.trim() || undefined,
    alias: alias || undefined,
  };
}

/** What `![[attachment]]` becomes, linking `href`: an image, audio or video player, a PDF frame, or else a link. */
export function renderAssetEmbed(href: string, assetPath: string, alias: string | undefined): string {
  const extension = assetPath.slice(assetPath.lastIndexOf(".")).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return `![${alias ?? ""}](${href})`;
  if (AUDIO_EXTENSIONS.has(extension)) return `<audio controls src="${href}"></audio>`;
  if (VIDEO_EXTENSIONS.has(extension)) return `<video controls src="${href}"></video>`;
  if (PDF_EXTENSIONS.has(extension)) {
    return `<iframe class="svartz-pdf-embed" src="${href}" title="${alias ?? assetPath}"></iframe>`;
  }
  return `<a href="${href}">${alias ?? assetPath}</a>`;
}

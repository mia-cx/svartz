import { posix } from "node:path";
import type { ProcessedFile } from "@svartz/core";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const WIKILINK = /!?\[\[([^\]]+)\]\]/g;
const HTML_TAG = /<(?:a|audio|iframe|img|link|source|video)\b[^>]*>/gi;
const HTML_ASSET = /\b(?:href|src|poster|srcset)\s*=\s*(["'])(.*?)\1/gi;
const ROAM_MEDIA = /\{\{\[\[(?:audio|video|pdf)\]\]:\s*([^}\r\n]+)\}\}/gi;
const markdown = unified().use(remarkParse);

/** Source spans for local Roam media outside code and HTML. */
export function roamMediaReferences(source: string): { start: number; end: number; target: string }[] {
  const references: { start: number; end: number; target: string }[] = [];
  visit(markdown.parse(source), "text", (node) => {
    const offset = node.position?.start.offset;
    if (offset === undefined) return;
    for (const match of node.value.matchAll(ROAM_MEDIA)) {
      const target = match[1]!;
      const start = offset + match.index! + match[0].indexOf(target);
      if (source.slice(start, start + target.length) !== target) continue;
      references.push({ start, end: start + target.length, target: target.trim() });
    }
  });
  return references;
}

function assetTarget(target: string): string | undefined {
  const path = target.split(/[?#]/, 1)[0]?.trim();
  if (!path || /^(?:[a-z]+:|\/\/)/i.test(path)) return;
  try {
    return decodeURIComponent(path).replaceAll("\\", "/");
  } catch {
    return path.replaceAll("\\", "/");
  }
}

/** Resolve an attachment using its vault path, note-relative path, or unique basename. */
export function createAssetResolver(assets: readonly ProcessedFile[]) {
  const byPath = new Map(assets.map((file) => [file.path.toLowerCase(), file.path]));
  const byName = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const file of assets) {
    const name = posix.basename(file.path).toLowerCase();
    if (ambiguousNames.has(name)) continue;
    if (byName.has(name)) {
      byName.delete(name);
      ambiguousNames.add(name);
    } else {
      byName.set(name, file.path);
    }
  }

  return (note: ProcessedFile, raw: string): string | undefined => {
    const target = assetTarget(raw);
    if (!target) return;
    const vaultPath = target.replace(/^\/+/, "");
    const relativePath = posix.normalize(posix.join(posix.dirname(note.path), target));
    return (target.startsWith("/") ? byPath.get(vaultPath.toLowerCase()) : undefined) ??
      byPath.get(relativePath.toLowerCase()) ??
      byPath.get(vaultPath.toLowerCase()) ??
      byName.get(posix.basename(vaultPath).toLowerCase());
  };
}

/** Collect vault attachments named by public note content, excluding code spans and fences. */
export function referencedAssets(
  notes: readonly ProcessedFile[],
  assets: readonly ProcessedFile[],
  roamMedia = false,
): Set<string> {
  const resolveAsset = createAssetResolver(assets);
  const selected = new Set<string>();
  for (const note of notes) {
    const resolve = (raw: string) => {
      const path = resolveAsset(note, raw);
      if (path) selected.add(path);
    };

    for (const field of ["socialImage", "image", "cover"] as const) {
      const value = note.frontmatter?.[field];
      if (typeof value === "string") resolve(value);
    }

    if (roamMedia) {
      for (const reference of roamMediaReferences(note.content)) resolve(reference.target);
    }

    visit(markdown.parse(note.content), (node) => {
      if (node.type === "link" || node.type === "image") {
        resolve(node.url);
      } else if (node.type === "text") {
        for (const match of node.value.matchAll(WIKILINK)) {
          resolve(match[1]!.split("|", 1)[0]!.split("#", 1)[0]!);
        }
      } else if (node.type === "html") {
        for (const tag of node.value.matchAll(HTML_TAG)) {
          for (const match of tag[0].matchAll(HTML_ASSET)) {
            if (/\bsrcset\s*=/i.test(match[0])) {
              for (const candidate of match[2]!.split(",")) resolve(candidate.trim().split(/\s+/, 1)[0]!);
            } else {
              resolve(match[2]!);
            }
          }
        }
      }
    });
  }
  return selected;
}

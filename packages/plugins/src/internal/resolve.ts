/**
 * Link resolution utilities — ported from @svartz/vault indexer.ts.
 * Deterministic tie-break: shared depth -> path depth -> lexicographic.
 */

import { posix } from "node:path";
import type { RawLink, LinkResolutionStrategy } from "@svartz/core";
import { fileToSlug } from "./slug";
import { routeSlug } from "./routes";

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

const decodePath = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/**
 * Markdown links name a file path, like a browser would: relative to the linking
 * note's physical folder, or to the vault root with a leading slash.
 */
const resolveMarkdownPath = (
  target: string,
  slugMap: Record<string, string>,
  sourceSlug: string,
  sources: readonly { slug: string; path: string }[],
): string | undefined => {
  const path = decodePath(target).replaceAll("\\", "/");
  const sourcePath = sources.find((entry) => entry.slug === sourceSlug)?.path ?? sourceSlug;
  const vaultPath = path.startsWith("/")
    ? posix.normalize(path).slice(1)
    : posix.join(posix.dirname(sourcePath), path);
  if (vaultPath.startsWith("../")) return;
  return slugMap[vaultPath.toLowerCase()] ?? slugMap[fileToSlug(vaultPath)];
};

export const resolveLink = (
  link: RawLink,
  slugMap: Record<string, string>,
  allSlugs: readonly string[],
  strategy: LinkResolutionStrategy,
  sourceSlug: string,
  sources: readonly { slug: string; path: string }[] = [],
): string | null => {
  const target = link.target.trim();
  if (!target) return null;

  if (link.type === "markdown") {
    const resolved = resolveMarkdownPath(target, slugMap, sourceSlug, sources);
    if (resolved !== undefined) return resolved;
  }

  const authored = slugMap[target.toLowerCase()];
  if (authored !== undefined) return authored;

  const normalized = fileToSlug(target);

  if (slugMap[normalized] !== undefined) return slugMap[normalized]!;

  if (strategy === "absolute") return null;

  const baseName = normalized.split("/").pop();
  if (!baseName) return null;

  // A frontmatter slug changes the URL, but wikilinks still name physical files.
  const candidates = [...new Set([
    ...allSlugs.filter((slug) => slug.split("/").pop() === baseName),
    ...sources.filter((entry) => fileToSlug(entry.path).split("/").pop() === baseName)
      .map((entry) => entry.slug),
  ])];
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
 * Build a resolution map from allocated slugs, physical filenames, and aliases.
 * Alias collisions are excluded. Duplicate authored stems prefer their canonical winner,
 * then the first authored path when another filename owns the natural route.
 */
export const buildSlugMap = (
  entries: ReadonlyArray<{ slug: string; path?: string; aliases?: readonly string[] }>,
): Record<string, string> => {
  const map: Record<string, string> = {};
  const ambiguousBasenames = new Set<string>();
  const ambiguousAliases = new Set<string>();
  const canonicalSlugs = new Set<string>();
  const authoredNames = new Set<string>();
  const authoredStems = new Map<string, typeof entries[number][]>();

  for (const entry of entries) {
    const normalized = entry.slug.toLowerCase();
    canonicalSlugs.add(normalized);
    map[normalized] = entry.slug;
  }

  // A literal authored filename wins over a normalized slug when names collide.
  // The normalized physical path keys the same way, so [[b/setup-notes]] still
  // names b/Setup Notes.md after a frontmatter slug changes its URL.
  for (const entry of entries) {
    if (!entry.path) continue;
    const stem = entry.path.replace(/\.(md|mdx|svx)$/i, "").toLowerCase();
    const normalizedPath = fileToSlug(entry.path);
    for (const key of new Set([stem, normalizedPath])) {
      const sameStem = authoredStems.get(key) ?? [];
      sameStem.push(entry);
      authoredStems.set(key, sameStem);
    }
    map[entry.path.toLowerCase()] = entry.slug;
    authoredNames.add(stem);
    authoredNames.add(normalizedPath);
    authoredNames.add(entry.path.toLowerCase());
  }

  for (const [stem, sameStem] of authoredStems) {
    const winner = sameStem.find((entry) => routeSlug(fileToSlug(entry.path!)) === entry.slug)
      ?? [...sameStem].sort((a, b) => a.path!.localeCompare(b.path!) || a.slug.localeCompare(b.slug))[0]!;
    map[stem] = winner.slug;
  }

  for (const entry of entries) {
    const sourceStem = entry.path?.replace(/\.(md|mdx|svx)$/i, "");
    const basenames = new Set([
      entry.slug.split("/").pop(),
      sourceStem?.split("/").pop(),
      entry.path ? fileToSlug(entry.path).split("/").pop() : undefined,
    ]);
    for (const baseName of basenames) {
      if (!baseName || baseName === entry.slug) continue;
      const normalized = baseName.toLowerCase();
      if (ambiguousBasenames.has(normalized)) continue;
      if (map[normalized] === undefined) {
        map[normalized] = entry.slug;
      } else if (map[normalized] !== entry.slug) {
        if (!canonicalSlugs.has(normalized) && !authoredNames.has(normalized)) {
          delete map[normalized];
        }
        ambiguousBasenames.add(normalized);
      }
    }

    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const normalizedAlias = alias.toLowerCase();
        if (authoredNames.has(normalizedAlias)) continue;
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

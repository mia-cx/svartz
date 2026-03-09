/**
 * core:index — single canonical index artifact producer.
 *
 * Builds the Index from ctx.files (with slugs, frontmatter, and resolved links).
 * Produces: entries (search), graph (forward links), backlinks (reverse links).
 *
 * Precondition: all transforms complete; files have slug, frontmatter, and links.
 * Postcondition: ctx.index is populated with the canonical Index artifact.
 */

import { definePlugin } from "@svartz/core";
import type {
  FolderIndexEntry,
  IndexEntry,
  IndexLink,
  Index,
  RouteIndex,
  SearchDocument,
  TagIndexEntry,
} from "@svartz/core";
import { countWords, extractDescription, stripMarkdownToText } from "./internal/parse";
import { normalizeDateTime } from "./internal/datetime";

const INDEX_VERSION = "1.0.0";
const DEFAULT_INDEX_TIMESTAMP = new Date(0);

function isMarkdownFile(extension: string | undefined): boolean {
  return extension !== undefined && [".md", ".mdx", ".svx"].includes(extension);
}

function slugToHref(slug: string): string {
  return slug === "index" ? "/" : `/${slug}/`;
}

function folderSlugFromEntry(slug: string): string | undefined {
  const segments = slug.split("/");
  if (segments.length <= 1) return undefined;

  if (segments[segments.length - 1] === "index") {
    return segments.slice(0, -1).join("/") || undefined;
  }

  return segments.slice(0, -1).join("/") || undefined;
}

function folderTitle(slug: string): string {
  return slug
    .split("/")
    .pop()
    ?.replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    ?? "Folder";
}

export const indexContent = definePlugin(() => ({
  id: "core:index",

  indexContent: {
    run(ctx) {
      const fm = ctx.config.frontmatter;
      const entries: IndexEntry[] = [];
      const search: SearchDocument[] = [];
      const tagCounts = new Map<string, number>();
      const folderCounts = new Map<string, number>();
      const noteRouteSet = new Set<string>();
      const assetRecords = ctx.files
        .filter((file) => !isMarkdownFile(file.extension))
        .map((file) => ({
          path: file.path,
          sourcePath: file.sourcePath ?? file.path,
        }))
        .sort((left, right) => left.path.localeCompare(right.path));

      for (const file of ctx.files) {
        if (!isMarkdownFile(file.extension)) continue;

        const frontmatter = file.frontmatter ?? {};

        const fmTitle = frontmatter[fm.titleField];
        const title =
          typeof fmTitle === "string" && fmTitle.length > 0
            ? fmTitle
            : "Untitled";

        const tags = Array.isArray(frontmatter[fm.tagsField])
          ? (frontmatter[fm.tagsField] as string[])
          : [];

        const aliases = Array.isArray(frontmatter[fm.aliasesField])
          ? [...new Set(frontmatter[fm.aliasesField] as string[])]
          : [];

        const fmDesc = frontmatter[fm.descriptionField];
        const description =
          typeof fmDesc === "string" && fmDesc.length > 0
            ? fmDesc
            : extractDescription(file.content);
        const plainTextContent = stripMarkdownToText(file.content);

        const createdAt =
          normalizeDateTime(frontmatter[fm.createdAtField], fm.dateFormat) ??
          file.createdAt ??
          DEFAULT_INDEX_TIMESTAMP;
        const modifiedAt =
          normalizeDateTime(frontmatter[fm.updatedAtField], fm.dateFormat) ??
          file.modifiedAt ??
          DEFAULT_INDEX_TIMESTAMP;

        let publishedAt: Date | undefined;
        if (fm.publishedField) {
          const pubVal = frontmatter[fm.publishedField];
          if (pubVal === true) {
            publishedAt = createdAt;
          } else if (pubVal && pubVal !== false && pubVal !== "") {
            publishedAt =
              normalizeDateTime(pubVal, fm.dateFormat) ?? undefined;
          }
        }

        const wc = countWords(file.content);

        const links: IndexLink[] = (file.rawLinks ?? []).map((rl) => ({
          raw: rl.raw,
          href:
            file.links?.find((resolved) => {
              const target = rl.target.toLowerCase().split("/").pop();
              return target && resolved.endsWith(target);
            }) ?? null,
          section: rl.section,
          label: rl.label,
        }));

        entries.push({
          slug: file.slug,
          path: file.path,
          title,
          tags,
          aliases,
          description,
          content: plainTextContent,
          links,
          toc: file.toc ?? [],
          wordCount: wc,
          readingTimeMinutes: Math.ceil(wc / 200) || 1,
          createdAt,
          modifiedAt,
          publishedAt,
        });

        search.push({
          id: file.slug,
          slug: file.slug,
          title,
          description,
          content: plainTextContent,
          tags,
          aliases,
        });

        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }

        const folderSlug = folderSlugFromEntry(file.slug);
        if (folderSlug) {
          folderCounts.set(folderSlug, (folderCounts.get(folderSlug) ?? 0) + 1);
        }

        noteRouteSet.add(slugToHref(file.slug));
      }

      entries.sort((a, b) => a.slug.localeCompare(b.slug));
      search.sort((a, b) => a.slug.localeCompare(b.slug));

      const graph: Record<string, readonly string[]> = {};
      const backlinks: Record<string, string[]> = {};

      for (const entry of entries) {
        backlinks[entry.slug] = [];
      }

      for (const file of ctx.files) {
        const resolvedLinks = file.links ?? [];
        graph[file.slug] = [...resolvedLinks].sort();

        for (const target of resolvedLinks) {
          if (!backlinks[target]) {
            backlinks[target] = [];
          }
          backlinks[target].push(file.slug);
        }
      }

      for (const slug of Object.keys(backlinks)) {
        backlinks[slug]!.sort();
      }

      const sortedBacklinks: Record<string, readonly string[]> = {};
      for (const slug of Object.keys(backlinks).sort()) {
        sortedBacklinks[slug] = backlinks[slug]!;
      }

      const sortedGraph: Record<string, readonly string[]> = {};
      for (const slug of Object.keys(graph).sort()) {
        sortedGraph[slug] = graph[slug]!;
      }

      const tags: TagIndexEntry[] = [...tagCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slug, noteCount]) => ({
          slug,
          title: slug,
          noteCount,
          href: `/tags/${slug}/`,
        }));

      const folders: FolderIndexEntry[] = [...folderCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slug, noteCount]) => ({
          slug,
          title: folderTitle(slug),
          noteCount,
          href: `/folders/${slug}/`,
        }));

      const routes: RouteIndex = {
        notes: [...noteRouteSet].sort(),
        tags: ["/tags/", ...tags.map((entry) => entry.href)],
        folders: ["/folders/", ...folders.map((entry) => entry.href)],
        all: [
          "/",
          ...new Set([
            ...noteRouteSet,
            "/tags/",
            ...tags.map((entry) => entry.href),
            "/folders/",
            ...folders.map((entry) => entry.href),
          ]),
        ].sort(),
      };

      const index: Index = {
        version: INDEX_VERSION,
        entries,
        graph: sortedGraph,
        backlinks: sortedBacklinks,
        search,
        tags,
        folders,
        routes,
        assets: assetRecords,
      };

      ctx.index = index;
    },
    options: { fatal: true },
  },
}));

export const INDEX_CONTENT_ID = "core:index" as const;

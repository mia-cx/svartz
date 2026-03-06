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
import type { IndexEntry, IndexLink, Index } from "@svartz/core";
import { deriveTitle } from "./internal/slug";
import { countWords, extractDescription } from "./internal/parse";
import { normalizeDateTime } from "./internal/datetime";

const INDEX_VERSION = "1.0.0";
const DEFAULT_INDEX_TIMESTAMP = new Date(0);

export const indexContent = definePlugin(() => ({
  id: "core:index",

  indexContent: {
    run(ctx) {
      const fm = ctx.config.frontmatter;
      const entries: IndexEntry[] = [];

      for (const file of ctx.files) {
        const frontmatter = file.frontmatter ?? {};

        const fmTitle = frontmatter[fm.titleField];
        const filename = file.path.split("/").pop() ?? "Untitled";
        const title =
          typeof fmTitle === "string" && fmTitle.length > 0
            ? fmTitle
            : deriveTitle(filename.replace(/\.[^.]+$/, ""));

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

        const createdAt =
          normalizeDateTime(frontmatter[fm.createdAtField], fm.dateFormat) ??
          DEFAULT_INDEX_TIMESTAMP;
        const modifiedAt =
          normalizeDateTime(frontmatter[fm.updatedAtField], fm.dateFormat) ??
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
          links,
          wordCount: wc,
          readingTimeMinutes: Math.ceil(wc / 200) || 1,
          createdAt,
          modifiedAt,
          publishedAt,
        });
      }

      entries.sort((a, b) => a.slug.localeCompare(b.slug));

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

      const index: Index = {
        version: INDEX_VERSION,
        entries,
        graph: sortedGraph,
        backlinks: sortedBacklinks,
      };

      ctx.index = index;
    },
    options: { fatal: true },
  },
}));

export const INDEX_CONTENT_ID = "core:index" as const;

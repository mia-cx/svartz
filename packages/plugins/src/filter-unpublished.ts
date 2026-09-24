/** Publish notes after frontmatter parsing and retain only assets they reference. */
import { minimatch } from "minimatch";
import { extname } from "node:path";
import { definePlugin, type ProcessedFile } from "@svartz/core";
import { referencedAssets } from "./internal/asset-references";

const NOTE_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

const matches = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => minimatch(path.replaceAll("\\", "/"), pattern, { dot: true }));

function isNote(file: ProcessedFile): boolean {
  return NOTE_EXTENSIONS.has(file.extension ?? extname(file.path).toLowerCase());
}

export const filterUnpublished = definePlugin(() => ({
  id: "core:filter-unpublished",

  filterUnpublished: {
    run(ctx) {
      const { include, exclude, frontmatter } = ctx.config;
      const inclusion = ctx.config.publicationMode === "inclusion";
      const publishedNotes = ctx.files.filter((file) => {
        if (!isNote(file)) return false;

        let published = (!inclusion || matches(file.path, include)) &&
          !matches(file.path, exclude);
        if (file.frontmatter?.draft === true) published = false;

        const publishedAt =
          file.frontmatter?.published_at ?? file.frontmatter?.[frontmatter.publishedField];
        if (publishedAt !== undefined && publishedAt !== null && publishedAt !== "") {
          published = true;
        }
        if (file.frontmatter?.private === true) published = false;
        return published;
      });

      const assets = ctx.files.filter(
        (file) => !isNote(file) && !matches(file.path, exclude),
      );
      const usedAssets = referencedAssets(publishedNotes, assets);
      const publishedPaths = new Set(publishedNotes.map((file) => file.path));
      ctx.files = ctx.files.filter((file) =>
        isNote(file) ? publishedPaths.has(file.path) : usedAssets.has(file.path),
      );

      const bodies = ctx.meta.get("sourceBodies");
      if (bodies instanceof Map) {
        const slugs = new Set(publishedNotes.map((file) => file.slug));
        for (const slug of bodies.keys()) {
          if (!slugs.has(slug)) bodies.delete(slug);
        }
      }
    },
    options: { fatal: true, enforce: "post" },
  },
}));

export const FILTER_UNPUBLISHED_ID = "core:filter-unpublished" as const;

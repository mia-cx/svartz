/**
 * core:transform-description — Extract/generate descriptions for files.
 *
 * If frontmatter has a description field, uses it directly.
 * Otherwise auto-generates from first sentences of body markdown.
 * Stores display values in frontmatter for downstream consumers, retaining the
 * overwritten properties separately so the index can publish authored values.
 */

import { definePlugin, type ProcessedFile } from "@svartz/core";
import { extractDescription } from "./internal/parse";
import { deriveTitle } from "./internal/slug";

export const DERIVED_PROPERTIES = "svartz:derivedProperties";
export type DerivedProperties = WeakMap<ProcessedFile, {
  original: Record<string, unknown>;
  generated: Record<string, unknown>;
}>;

export const transformDescription = definePlugin(() => ({
  id: "core:transform-description",

  transformDescription: {
    run(ctx) {
      const descField = ctx.config.frontmatter.descriptionField;
      const titleField = ctx.config.frontmatter.titleField;
      // ctx.meta can survive a rebuild; provenance belongs to this run's file objects.
      const derived: DerivedProperties = new WeakMap();
      ctx.meta.set(DERIVED_PROPERTIES, derived);

      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        file.frontmatter ??= {};
        const original = { ...file.frontmatter };
        const generated: Record<string, unknown> = {};
        derived.set(file, { original, generated });

        const existingTitle = file.frontmatter[titleField];
        if (typeof existingTitle !== "string" || existingTitle.length === 0) {
          const filename = file.path.split("/").pop() ?? "Untitled";
          file.frontmatter[titleField] = deriveTitle(
            filename.replace(/\.[^.]+$/, ""),
          );
          generated[titleField] = file.frontmatter[titleField];
        }

        const existing = file.frontmatter[descField];
        if (typeof existing === "string" && existing.length > 0) continue;

        file.frontmatter[descField] = extractDescription(file.content);
        generated[descField] = file.frontmatter[descField];
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_DESCRIPTION_ID =
  "core:transform-description" as const;

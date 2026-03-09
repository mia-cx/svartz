/**
 * core:transform-description — Extract/generate descriptions for files.
 *
 * If frontmatter has a description field, uses it directly.
 * Otherwise auto-generates from first sentences of body markdown.
 * Stores result in frontmatter.description for downstream consumers.
 */

import { definePlugin } from "@svartz/core";
import { extractDescription } from "./internal/parse";
import { deriveTitle } from "./internal/slug";

export const transformDescription = definePlugin(() => ({
  id: "core:transform-description",

  transformDescription: {
    run(ctx) {
      const descField = ctx.config.frontmatter.descriptionField;
      const titleField = ctx.config.frontmatter.titleField;

      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        file.frontmatter ??= {};

        const existingTitle = file.frontmatter[titleField];
        if (typeof existingTitle !== "string" || existingTitle.length === 0) {
          const filename = file.path.split("/").pop() ?? "Untitled";
          file.frontmatter[titleField] = deriveTitle(
            filename.replace(/\.[^.]+$/, ""),
          );
        }

        if (!file.frontmatter) continue;

        const existing = file.frontmatter[descField];
        if (typeof existing === "string" && existing.length > 0) continue;

        file.frontmatter[descField] = extractDescription(file.content);
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_DESCRIPTION_ID =
  "core:transform-description" as const;

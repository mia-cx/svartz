/**
 * core:transform-description — Extract/generate descriptions for files.
 *
 * If frontmatter has a description field, uses it directly.
 * Otherwise auto-generates from first sentences of body markdown.
 * Stores result in frontmatter.description for downstream consumers.
 */

import { definePlugin } from "@svartz/core";
import { extractDescription } from "./internal/parse";

export const transformDescription = definePlugin(() => ({
  id: "core:transform-description",

  transformDescription: {
    run(ctx) {
      const descField = ctx.config.frontmatter.descriptionField;

      for (const file of ctx.files) {
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

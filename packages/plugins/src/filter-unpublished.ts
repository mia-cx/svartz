/**
 * core:filter-unpublished — remove unpublished files from the pipeline.
 *
 * Publication modes:
 *   - opt-out (default): missing/null => published
 *   - explicit: only true or another truthy value => published
 * In both modes false and an empty string are unpublished.
 *
 * Runs `post` relative to parseFrontmatter to ensure frontmatter is available.
 */

import { definePlugin } from "@svartz/core";

export const filterUnpublished = definePlugin(() => ({
  id: "core:filter-unpublished",

  filterUnpublished: {
    run(ctx) {
      const publishedField = ctx.config.frontmatter.publishedField;
      const explicitPublication = ctx.config.frontmatter.publicationMode === "explicit";

      ctx.files = ctx.files.filter((file) => {
        if (!publishedField) return true;
        if (!file.frontmatter) return !explicitPublication;

        const value = file.frontmatter[publishedField];

        if (value === undefined || value === null) return !explicitPublication;
        if (value === true) return true;
        if (value === false) return false;
        if (value === "") return false;

        // Any other truthy value (datetime string, number) => published
        return Boolean(value);
      });
    },
    options: { fatal: true, enforce: "post" },
  },
}));

export const FILTER_UNPUBLISHED_ID = "core:filter-unpublished" as const;

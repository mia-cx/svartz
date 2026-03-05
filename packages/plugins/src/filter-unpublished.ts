/**
 * core:filter-unpublished — remove unpublished files from the pipeline.
 *
 * Published semantics (from plan):
 *   - published missing/null/undefined => published
 *   - published: true => published
 *   - published: <datetime string> => published
 *   - published: false => unpublished
 *   - published: "" => unpublished
 *
 * Runs `post` relative to parseFrontmatter to ensure frontmatter is available.
 */

import { definePlugin } from "@svartz/core";

export const filterUnpublished = definePlugin(() => ({
  id: "core:filter-unpublished",

  filterUnpublished: {
    run(ctx) {
      const publishedField = ctx.vault.frontmatter.publishedField;

      ctx.files = ctx.files.filter((file) => {
        if (!publishedField || !file.frontmatter) return true;

        const value = file.frontmatter[publishedField];

        if (value === undefined || value === null) return true;
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

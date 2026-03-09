/**
 * core:transform-toc — Table of Contents extraction.
 *
 * Extracts heading structure from source notes only. Embedded content does not
 * contribute headings to the parent note's TOC.
 */

import { definePlugin } from "@svartz/core";
import { extractHeadings } from "./internal/parse";

export const transformToc = definePlugin(() => ({
  id: "core:transform-toc",

  transformToc: {
    run(ctx) {
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) {
          continue;
        }

        file.toc = extractHeadings(file.content);
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_TOC_ID = "core:transform-toc" as const;

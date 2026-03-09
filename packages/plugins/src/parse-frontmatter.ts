/**
 * core:parse-frontmatter — extract frontmatter and raw links from each file.
 *
 * Postcondition: markdown files have `rawLinks` populated.
 * If frontmatter parsing fails, the leading frontmatter block is stripped and
 * downstream plugins continue with `file.frontmatter === undefined`.
 */

import { definePlugin } from "@svartz/core";
import { extname } from "node:path";
import { extractFrontmatter, extractRawLinks } from "./internal/parse";

export const parseFrontmatter = definePlugin(() => ({
  id: "core:parse-frontmatter",

  parseFrontmatter: {
    run(ctx) {
      const sourceBodies = new Map<string, string>();

      for (const file of ctx.files) {
        const extension = file.extension ?? extname(file.path).toLowerCase();
        if (![".md", ".mdx", ".svx"].includes(extension)) continue;

        const { frontmatter, bodyMarkdown } = extractFrontmatter(file.content);
        file.frontmatter = frontmatter;
        file.content = bodyMarkdown;
        file.rawLinks = extractRawLinks(bodyMarkdown);
        sourceBodies.set(file.slug, bodyMarkdown);
      }

      ctx.meta.set("sourceBodies", sourceBodies);
    },
    options: { fatal: true },
  },
}));

export const PARSE_FRONTMATTER_ID = "core:parse-frontmatter" as const;

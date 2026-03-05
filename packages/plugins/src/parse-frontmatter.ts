/**
 * core:parse-frontmatter — extract frontmatter and raw links from each file.
 *
 * Postcondition: every ProcessedFile has `frontmatter` and `rawLinks` populated.
 * Body markdown replaces `content` (frontmatter stripped).
 */

import { definePlugin } from "@svartz/core";
import { extractFrontmatter, extractRawLinks } from "./internal/parse";

export const parseFrontmatter = definePlugin(() => ({
  id: "core:parse-frontmatter",

  parseFrontmatter: {
    run(ctx) {
      for (const file of ctx.files) {
        const { frontmatter, bodyMarkdown } = extractFrontmatter(file.content);
        file.frontmatter = frontmatter;
        file.content = bodyMarkdown;
        file.rawLinks = extractRawLinks(bodyMarkdown);
      }
    },
    options: { fatal: true },
  },
}));

export const PARSE_FRONTMATTER_ID = "core:parse-frontmatter" as const;

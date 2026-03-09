/**
 * core:transform-ofm — Obsidian Flavored Markdown transforms.
 *
 * Handles the lowest-risk text-level OFM features before mdsvex compilation:
 * comments, inline highlights, and callout markers.
 */

import { definePlugin } from "@svartz/core";

const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const OBSIDIAN_COMMENT_REGEX = /%%([\s\S]*?)%%/g;
const COMMENT_PLACEHOLDER_PREFIX = "__SVARTZ_HTML_COMMENT_";

function transformCallouts(markdown: string): string {
  const lines = markdown.split("\n");
  return lines
    .map((line) => {
      const match = /^>\s*\[!([^\]\s]+)\]([+-])?\s*(.*)$/.exec(line);
      if (!match) return line;

      const [, rawType = "note", , title] = match;
      const renderedTitle =
        title && title.length > 0
          ? title
          : rawType.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

      return `> **${renderedTitle}**`;
    })
    .join("\n");
}

function normalizeComments(markdown: string): string {
  return markdown.replace(
    OBSIDIAN_COMMENT_REGEX,
    (_match, commentBody: string) => `<!--${commentBody}-->`,
  );
}

function protectHtmlComments(markdown: string): {
  sanitizedMarkdown: string;
  comments: string[];
} {
  const comments: string[] = [];
  const sanitizedMarkdown = markdown.replace(HTML_COMMENT_REGEX, (comment) => {
    const placeholder = `${COMMENT_PLACEHOLDER_PREFIX}${comments.length}__`;
    comments.push(comment);
    return placeholder;
  });

  return { sanitizedMarkdown, comments };
}

function restoreHtmlComments(markdown: string, comments: readonly string[]): string {
  return comments.reduce(
    (restoredMarkdown, comment, index) =>
      restoredMarkdown.replace(`${COMMENT_PLACEHOLDER_PREFIX}${index}__`, comment),
    markdown,
  );
}

function sanitizeMarkdownForSvelte(markdown: string): string {
  const { sanitizedMarkdown, comments } = protectHtmlComments(markdown);
  const lines = sanitizedMarkdown.split("\n");
  let inCodeFence = false;

  const sanitized = lines
    .map((line) => {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inCodeFence = !inCodeFence;
        return line;
      }

      if (inCodeFence) return line;
      if (/^#{1,6}\s*$/.test(trimmed)) return "";

      return line
        .replace(/<%/g, "&lt;%")
        .replace(/%>/g, "%&gt;")
        .replace(/<(?:@[!&]?\d+|#\d+|a?:[a-z0-9_]+:\d+|t:\d+(?::[a-z])?)>/gi, (match) =>
          match.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        )
        .replace(/<<(?=\s)/g, "&lt;&lt;")
        .replace(/(?<=\s)>>/g, "&gt;&gt;")
        .replace(/<(?=[^A-Za-z!/])/g, "&lt;")
        .replace(/(?<![A-Za-z0-9"'\/=])>/g, "&gt;");
    })
    .join("\n");

  return restoreHtmlComments(sanitized, comments);
}

export const transformOfm = definePlugin(() => ({
  id: "core:transform-ofm",

  transformOfm: {
    run(ctx) {
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        file.content = sanitizeMarkdownForSvelte(
          transformCallouts(
            normalizeComments(
              file.content.replace(/==([^=]+)==/g, "<mark>$1</mark>"),
            ),
          ),
        );
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_OFM_ID = "core:transform-ofm" as const;

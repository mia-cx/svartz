/**
 * core:transform-ofm — Obsidian Flavored Markdown transforms.
 *
 * Handles the lowest-risk text-level OFM features before mdsvex compilation:
 * comments, inline highlights, and callout markers.
 */

import { definePlugin } from "@svartz/core";

const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const OBSIDIAN_COMMENT_REGEX = /%%([\s\S]*?)%%/g;
const PROTECTED_SEGMENT_PREFIX = "__SVARTZ_PROTECTED_SEGMENT_";

interface SegmentStore {
  readonly prefix: string;
  readonly segments: string[];
}

function createSegmentStore(markdown: string): SegmentStore {
  let prefix = PROTECTED_SEGMENT_PREFIX;
  while (markdown.includes(prefix)) prefix = `_${prefix}`;
  return { prefix, segments: [] };
}

function protectSegment(store: SegmentStore, segment: string): string {
  const placeholder = `${store.prefix}${store.segments.length}__`;
  store.segments.push(segment);
  return placeholder;
}

function stripBlockquotePrefix(line: string): string {
  return line.replace(/^[ \t]*(?:>[ \t]?)+/, "");
}

function isIndentedCode(line: string): boolean {
  if (/^(?: {4}|\t)/.test(line)) return true;
  const withoutBlockquote = stripBlockquotePrefix(line);
  return withoutBlockquote !== line && /^(?: {4}|\t)/.test(withoutBlockquote);
}

function protectCode(markdown: string, store: SegmentStore): string {
  const lines = markdown.split("\n");
  const protectedLines: string[] = [];
  let fence: { readonly marker: "`" | "~"; readonly length: number } | undefined;
  let fencedLines: string[] = [];

  for (const line of lines) {
    if (!fence) {
      if (isIndentedCode(line)) {
        protectedLines.push(protectSegment(store, line));
        continue;
      }

      const openingFence = /^(`{3,}|~{3,})/.exec(stripBlockquotePrefix(line));
      if (!openingFence) {
        protectedLines.push(line);
        continue;
      }

      const token = openingFence[1]!;
      fence = {
        marker: token[0] as "`" | "~",
        length: token.length,
      };
      fencedLines = [line];
      continue;
    }

    fencedLines.push(line);
    const closingFence = new RegExp(
      `^${fence.marker === "`" ? "`" : "~"}{${fence.length},}\\s*$`,
    );
    if (!closingFence.test(stripBlockquotePrefix(line))) continue;

    protectedLines.push(protectSegment(store, fencedLines.join("\n")));
    fence = undefined;
    fencedLines = [];
  }

  if (fencedLines.length > 0) {
    protectedLines.push(protectSegment(store, fencedLines.join("\n")));
  }

  return protectedLines
    .join("\n")
    .replace(/(`+)(?!`)([\s\S]*?)\1(?!`)/g, (codeSpan) =>
      protectSegment(store, codeSpan),
    );
}

function restoreSegments(markdown: string, store: SegmentStore): string {
  return store.segments.reduce(
    (restoredMarkdown, segment, index) =>
      restoredMarkdown.replace(`${store.prefix}${index}__`, segment),
    markdown,
  );
}

function normalizeComments(markdown: string): string {
  return markdown.replace(
    OBSIDIAN_COMMENT_REGEX,
    (_match, commentBody: string) => `<!--${commentBody}-->`,
  );
}

function protectHtmlComments(markdown: string, store: SegmentStore): string {
  return markdown.replace(HTML_COMMENT_REGEX, (comment) => protectSegment(store, comment));
}

function titleCaseCalloutType(type: string): string {
  return type
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeCalloutType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function transformCallouts(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const match = /^([ \t]*(?:>[ \t]*)+)\[!([^\]\s]+)\]([+-])?\s*(.*)$/.exec(line);
      if (!match) return line;

      const [, quotePrefix, rawType = "note", fold, customTitle] = match;
      const type = normalizeCalloutType(rawType);
      const title = customTitle || titleCaseCalloutType(rawType);
      const foldState = fold === "+" ? "open" : fold === "-" ? "closed" : undefined;
      const foldAttribute = foldState ? ` data-callout-fold="${foldState}"` : "";

      return `${quotePrefix}<span class="callout-marker" data-callout="${type}"${foldAttribute} aria-hidden="true"></span> **${title}**`;
    })
    .join("\n");
}

function transformHighlights(markdown: string): string {
  return markdown.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
}

function sanitizeMarkdownForSvelte(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s*$/.test(trimmed)) return "";

      return line
        .replace(/<%/g, "&lt;%")
        .replace(/%>/g, "%&gt;")
        .replace(/<(?:@[!&]?\d+|#\d+|a?:[a-z0-9_]+:\d+|t:\d+(?::[a-z])?)>/gi, (match) =>
          match.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        )
        .replace(/<<(?=\s)/g, "&lt;&lt;")
        .replace(/<(?=[^A-Za-z!/])/g, "&lt;")
        .replace(/&lt;([^<>\n]*)>/g, "&lt;$1&gt;");
    })
    .join("\n");
}

function transformMarkdown(markdown: string): string {
  const store = createSegmentStore(markdown);
  const protectedCode = protectCode(markdown, store);
  const normalizedComments = normalizeComments(protectedCode);
  const protectedComments = protectHtmlComments(normalizedComments, store);
  const transformed = sanitizeMarkdownForSvelte(
    transformCallouts(transformHighlights(protectedComments)),
  );

  return restoreSegments(transformed, store);
}

export const transformOfm = definePlugin(() => ({
  id: "core:transform-ofm",

  transformOfm: {
    run(ctx) {
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        file.content = transformMarkdown(file.content);
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_OFM_ID = "core:transform-ofm" as const;

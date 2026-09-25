/**
 * core:transform-ofm — Obsidian Flavored Markdown transforms.
 *
 * Handles the lowest-risk text-level OFM features before mdsvex compilation:
 * comments, inline highlights, and callout markers.
 */

import { definePlugin, getCompilerContributions } from "@svartz/core";
import { posix } from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const OBSIDIAN_COMMENT_REGEX = /%%([\s\S]*?)%%/g;
const PROTECTED_SEGMENT_PREFIX = "__SVARTZ_PROTECTED_SEGMENT_";
const INLINE_TAG = /(^|\s)#([-_\p{L}\p{M}\p{Extended_Pictographic}\d]+(?:\/[-_\p{L}\p{M}\p{Extended_Pictographic}\d]+)*)/gu;
const markdownParser = unified().use(remarkParse);

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

      const [, quotePrefix = "> ", rawType = "note", fold, customTitle] = match;
      const type = normalizeCalloutType(rawType);
      const title = customTitle || titleCaseCalloutType(rawType);
      const foldState = fold === "+" ? "open" : fold === "-" ? "closed" : undefined;
      const foldAttribute = foldState ? ` data-callout-fold="${foldState}"` : "";

      return `${quotePrefix}<span class="callout-marker" data-callout="${type}"${foldAttribute} aria-hidden="true"></span> **${title}**\n${quotePrefix.trimEnd()}`;
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

/** Link tags in parsed prose while leaving code, HTML, and authored links alone. */
export function transformInlineTags(markdown: string, sourceSlug: string, tagsRoute: string): { content: string; tags: string[] } {
  const tags = new Set<string>();
  const replacements: { start: number; end: number; html: string }[] = [];
  const htmlLinks = [...markdown.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)]
    .map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
  visit(markdownParser.parse(markdown), (node) => {
    if (node.type === "link" || node.type === "linkReference") return SKIP;
    if (node.type !== "text") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    for (const match of markdown.slice(start, end).matchAll(INLINE_TAG)) {
      const rawTag = match[2]!;
      if (/^[\d/]+$/.test(rawTag)) continue;
      const tag = rawTag.toLowerCase();
      const target = `/${tagsRoute.replace(/^\/+|\/+$/g, "")}/${tag}/`;
      const from = sourceSlug === "index" ? "/" : `/${sourceSlug}/`;
      const relative = posix.relative(from, target);
      const href = relative === "" ? "./" : relative.endsWith("/") ? relative : `${relative}/`;
      const offset = start + match.index! + match[1]!.length;
      if (htmlLinks.some((link) => link.start <= offset && offset < link.end)) continue;
      tags.add(tag);
      replacements.push({ start: offset, end: offset + rawTag.length + 1,
        html: `<a class="tag-link" href="${href}">#${rawTag}</a>` });
    }
  });
  let content = markdown;
  for (const replacement of replacements.reverse()) {
    content = content.slice(0, replacement.start) + replacement.html + content.slice(replacement.end);
  }
  return { content, tags: [...tags] };
}

function escapeDiagram(value: string): string {
  return value.replace(/[&<>"'{}]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    "{": "&#123;", "}": "&#125;",
  })[character]!);
}

function hasMermaid(markdown: string): boolean {
  let found = false;
  visit(markdownParser.parse(markdown), "code", (node) => {
    if (node.lang?.toLowerCase() === "mermaid") found = true;
  });
  return found;
}

function remarkMermaid() {
  return (tree: ReturnType<typeof markdownParser.parse>) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang?.toLowerCase() !== "mermaid" || index === undefined || !parent) return;
      parent.children[index] = {
        type: "html",
        value: `<pre class="svartz-mermaid">${escapeDiagram(node.value)}</pre>`,
      };
    });
  };
}

function transformMarkdown(markdown: string, sourceSlug: string, tagsRoute: string): { content: string; tags: string[] } {
  const store = createSegmentStore(markdown);
  const protectedCode = protectCode(markdown, store);
  const normalizedComments = normalizeComments(protectedCode);
  const protectedComments = protectHtmlComments(normalizedComments, store);
  const transformed = sanitizeMarkdownForSvelte(
    transformCallouts(transformHighlights(protectedComments)),
  );
  const tagged = transformInlineTags(transformed, sourceSlug, tagsRoute);
  return { content: restoreSegments(tagged.content, store), tags: tagged.tags };
}

export const transformOfm = definePlugin(() => ({
  id: "core:transform-ofm",

  transformOfm: {
    run(ctx) {
      const routes = ctx.config.theme.routes as { tags?: string } | undefined;
      let mermaid = false;
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        const transformed = transformMarkdown(file.content, file.slug, routes?.tags ?? "tags");
        file.content = transformed.content;
        file.inlineTags = transformed.tags;
        mermaid ||= hasMermaid(file.content);
      }
      if (mermaid) {
        const compiler = getCompilerContributions(ctx);
        compiler.remarkPlugins.push(remarkMermaid);
        compiler.browserResources.set("core:mermaid", {
          id: "core:mermaid", kind: "script", importId: "@svartz/plugins/browser-mermaid",
        });
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_OFM_ID = "core:transform-ofm" as const;

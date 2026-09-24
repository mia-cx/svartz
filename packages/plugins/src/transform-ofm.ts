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

function protectCode(markdown: string, store: SegmentStore, executable: boolean): string {
  const spans: { start: number; end: number }[] = [];
  visit(markdownParser.parse(markdown), (node) => {
    if (node.type !== "code" && node.type !== "inlineCode" && !(executable && node.type === "html")) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) spans.push({ start, end });
  });
  let protectedMarkdown = markdown;
  for (const { start, end } of spans.sort((left, right) => right.start - left.start)) {
    protectedMarkdown = protectedMarkdown.slice(0, start) +
      protectSegment(store, markdown.slice(start, end)) +
      protectedMarkdown.slice(end);
  }
  return protectedMarkdown;
}

function restoreSegments(markdown: string, store: SegmentStore): string {
  let restored = markdown;
  for (let index = store.segments.length - 1; index >= 0; index--) {
    restored = restored.replaceAll(`${store.prefix}${index}__`, () => store.segments[index]!);
  }
  return restored;
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

/** Apply `rewrite` to the Markdown outside code spans and fences. */
export function transformOutsideCode(markdown: string, rewrite: (text: string) => string): string {
  const store = createSegmentStore(markdown);
  return restoreSegments(rewrite(protectCode(markdown, store, false)), store);
}

/** Comments, highlights, callout markers, inline tags, and Svelte-safe escaping for one Markdown body. */
export function transformMarkdown(markdown: string, sourceSlug: string, tagsRoute: string, executable: boolean): { content: string; tags: string[] } {
  const store = createSegmentStore(markdown);
  const protectedCode = protectCode(markdown, store, executable);
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

        const transformed = transformMarkdown(file.content, file.slug, routes?.tags ?? "tags", file.extension === ".svx");
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

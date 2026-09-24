/** Optional ox-hugo source normalization before Svartz parses links and frontmatter. */
import { definePlugin } from "@svartz/core";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface OxHugoOptions {
  wikilinks: boolean;
  removePredefinedAnchor: boolean;
  removeHugoShortcode: boolean;
  replaceFigureWithMdImg: boolean;
  replaceOrgLatex: boolean;
}

const defaults: OxHugoOptions = {
  wikilinks: true, removePredefinedAnchor: true, removeHugoShortcode: true,
  replaceFigureWithMdImg: true, replaceOrgLatex: true,
};
const markdownParser = unified().use(remarkParse);
const FRONTMATTER_HEADER = /^(?:---|\+\+\+)\s*\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)\s*(?:\r?\n|$)/;

function replaceOutsideCode(source: string, pattern: RegExp, replacement: (...captures: string[]) => string): string {
  const codeRanges: { start: number; end: number }[] = [];
  visit(markdownParser.parse(source), (node) => {
    if (node.type !== "code" && node.type !== "inlineCode") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) codeRanges.push({ start, end });
  });
  const changes = [...source.matchAll(pattern)]
    .filter((match) => !codeRanges.some(({ start, end }) => start <= match.index! && match.index! < end))
    .map((match) => ({ start: match.index!, end: match.index! + match[0].length, value: replacement(...match) }));
  let result = source;
  for (const change of changes.reverse()) result = result.slice(0, change.start) + change.value + result.slice(change.end);
  return result;
}

function normalizeBody(source: string, options: OxHugoOptions): string {
  let body = source;
  if (options.wikilinks) {
    body = replaceOutsideCode(body, /\[([^\]]+)\]\(\{\{<\s*relref\s+"([^"]+)"\s*>\}\}\)/g,
      (_match, label, target) => `[${label}](${target})`);
  }
  if (options.removePredefinedAnchor) {
    body = replaceOutsideCode(body, /^(#{1,6}\s+.+?)\s+\{#[^}]+\}\s*$/gm,
      (_match, heading) => heading);
  }
  if (options.removeHugoShortcode) {
    body = replaceOutsideCode(body, /\{\{[<%]\s*([^{}]+?)\s*[>%]\}\}/g,
      (_match, content) => content);
  }
  if (options.replaceFigureWithMdImg) {
    body = replaceOutsideCode(body, /<figure\s+src="([^"]+)"\s*\/?\s*>/gi,
      (_match, source) => `![](${source})`);
  }
  if (options.replaceOrgLatex) {
    body = replaceOutsideCode(body, /\\begin\{equation\}([\s\S]*?)\\end\{equation\}|\\\[([\s\S]*?)\\\]/g,
      (_match, equation, bracketed) => `$$${(equation || bracketed).replaceAll("\\_", "_")}$$`);
    body = replaceOutsideCode(body, /\\\((.+?)\\\)/g,
      (_match, equation) => `$${equation.replaceAll("\\_", "_")}$`);
  }
  return body;
}

/** Normalize ox-hugo syntax before the required frontmatter and link parser. */
export const oxHugoFlavoredMarkdown = (userOptions: Partial<OxHugoOptions> = {}) => definePlugin(() => ({
  id: "core:oxhugo-flavored-markdown",
  parseFrontmatter: {
    run(ctx) {
      const options = { ...defaults, ...userOptions };
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;
        const header = FRONTMATTER_HEADER.exec(file.content)?.[0] ?? "";
        file.content = header + normalizeBody(file.content.slice(header.length), options);
      }
    },
    options: { fatal: true, enforce: "pre" },
  },
}))();

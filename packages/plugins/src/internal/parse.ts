/**
 * Markdown parsing utilities — ported from @svartz/vault parse.ts.
 * Kept Effect-free for plugin authors.
 */

import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import type { RawLink, TocEntry } from "@svartz/core";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { parse as parseToml } from "smol-toml";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

const FRONTMATTER_OPEN_REGEX = /^(---|\+\+\+)\s*\r?\n/;
const FRONTMATTER_BLOCK_REGEX = /^(---|\+\+\+)\s*\r?\n([\s\S]*?)\r?\n\1\s*(?:\r?\n|$)/;
const TEMPLATER_TAG_REGEX = /<%[\s\S]*?%>/g;
const markdownParser = unified().use(remarkParse);

function isEscaped(source: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; source[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function htmlElementRanges(markdown: string): { start: number; end: number }[] {
  return [...markdown.matchAll(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)]
    .map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
}

function inRange(offset: number, ranges: { start: number; end: number }[]): boolean {
  return ranges.some(({ start, end }) => start <= offset && offset < end);
}

function sanitizeFrontmatterSource(frontmatterSource: string): string {
  return frontmatterSource.replace(TEMPLATER_TAG_REGEX, "svartz-templater");
}

export const extractFrontmatter = (
  content: string,
): { frontmatter?: Record<string, unknown>; bodyMarkdown: string } => {
  const frontmatterMatch = FRONTMATTER_BLOCK_REGEX.exec(content);
  if (!frontmatterMatch) {
    if (FRONTMATTER_OPEN_REGEX.test(content)) throw new Error("Unterminated frontmatter");
    return {
      frontmatter: undefined,
      bodyMarkdown: content,
    };
  }

  const frontmatterSource = frontmatterMatch[2]!;
  const bodyMarkdown = content.slice(frontmatterMatch[0].length);

  try {
    const parsed: unknown = frontmatterMatch[1] === "+++"
      ? parseToml(frontmatterSource)
      : matter(`---\n${sanitizeFrontmatterSource(frontmatterSource)}\n---\n${bodyMarkdown}`).data;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid frontmatter object");
    return {
      frontmatter: parsed as Record<string, unknown>,
      bodyMarkdown,
    };
  } catch {
    return {
      frontmatter: undefined,
      bodyMarkdown,
    };
  }
};

type PositionedLink = RawLink & { start: number; end: number };

function isRoamMarker(markdown: string, start: number, end: number, target: string): boolean {
  if (target === ">" && /^(?:\s|$)/.test(markdown.slice(end))) return true;
  if (markdown.slice(start - 2, start) !== "{{") return false;
  const suffix = markdown.slice(end);
  return (/^(?:TODO|DONE)$/i.test(target) && suffix.startsWith("}}")) ||
    (/^(?:audio|video|pdf)$/i.test(target) && /^:\s*[^}\r\n]+\}\}/.test(suffix));
}

function collectLinkSpans(markdown: string, roamReserved = false): PositionedLink[] {
  const links: PositionedLink[] = [];
  const htmlRanges = htmlElementRanges(markdown);
  const wikilinkRegex = /(?<!!)\[\[([^\]]+)\]\]/g;
  visit(markdownParser.parse(markdown), (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || inRange(start, htmlRanges)) return;

    if (node.type === "text") {
      for (const match of markdown.slice(start, end).matchAll(wikilinkRegex)) {
        const offset = start + match.index!;
        if (markdown[offset - 1] === "!" || isEscaped(markdown, offset)) continue;
        const [targetWithSection, ...labelParts] = match[1]!.split("|");
        const [target, section] = targetWithSection!.split("#");
        if (roamReserved && isRoamMarker(markdown, offset, offset + match[0].length, target ?? "")) continue;
        if (target?.startsWith("http://") || target?.startsWith("https://")) continue;
        links.push({
          raw: match[0], target: target ?? "", section: section || undefined,
          label: labelParts.length ? labelParts.join("|") : undefined, type: "wikilink",
          start: offset, end: offset + match[0].length,
        });
      }
      return;
    }

    if (node.type === "linkReference") return SKIP;
    if (node.type !== "link") return;
    if (/^[a-z][\w+.-]*:/i.test(node.url) || node.url.startsWith("//")) return SKIP;
    const [target, section] = node.url.split("#");
    links.push({
      raw: markdown.slice(start, end), target: target ?? "", section: section || undefined,
      label: toString(node), type: "markdown", start, end,
    });
    return SKIP;
  });
  return links;
}

export const extractRawLinks = (markdown: string, roamReserved = false): RawLink[] =>
  collectLinkSpans(markdown, roamReserved).map(({ start: _start, end: _end, ...link }) => link);

/** Source spans for authored links; excludes code, embeds, escaped text, and raw HTML. */
export function findRawLinkSpans(markdown: string, raw: string, type: RawLink["type"], roamReserved = false): { start: number; end: number }[] {
  return collectLinkSpans(markdown, roamReserved)
    .filter((link) => link.raw === raw && link.type === type)
    .map(({ start, end }) => ({ start, end }));
}

export const stripMarkdownToText = (markdown: string): string =>
  markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/%%[\s\S]*?%%/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(
      /!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g,
      (_m, _target, label) => label ?? _target,
    )
    .replace(/[#>*_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const extractDescription = (markdown: string): string => {
  const stripped = stripMarkdownToText(markdown);

  const sentences = stripped.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return stripped.slice(0, 200).trim();
  return sentences.slice(0, 3).join("").trim().slice(0, 300);
};

export const countWords = (markdown: string): number => {
  const stripped = stripMarkdownToText(markdown);

  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
};

export const extractHeadings = (markdown: string): TocEntry[] => {
  return headingEntries(markdown).map(({ depth, text, slug }) => ({ depth, text, slug }));
};

function headingEntries(markdown: string): (TocEntry & { line: number })[] {
  const slugger = new GithubSlugger();
  const headings: (TocEntry & { line: number })[] = [];
  visit(markdownParser.parse(markdown), "heading", (node) => {
    const text = toString(node)
      .replace(/!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_m, target, label) => label ?? target)
      .trim();
    if (!text || !node.position) return;
    headings.push({ depth: node.depth, text, slug: slugger.slug(text), line: node.position.start.line - 1 });
  });
  return headings;
}

export const extractSectionMarkdown = (
  markdown: string,
  headingSlug: string,
): string | undefined => {
  const lines = markdown.split("\n");
  const headings = headingEntries(markdown);
  const start = headings.findIndex(({ slug }) => slug === headingSlug);
  if (start < 0) return undefined;
  const end = headings.slice(start + 1).find(({ depth }) => depth <= headings[start]!.depth)?.line ?? lines.length;
  return lines.slice(headings[start]!.line, end).join("\n").trim();
};

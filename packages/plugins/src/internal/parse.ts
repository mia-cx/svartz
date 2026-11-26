/**
 * Markdown parsing utilities — ported from @svartz/vault parse.ts.
 * Kept Effect-free for plugin authors.
 */

import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import type { TocEntry } from "@svartz/core";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { parse as parseToml } from "smol-toml";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const FRONTMATTER_OPEN_REGEX = /^(---|\+\+\+)\s*\r?\n/;
const FRONTMATTER_BLOCK_REGEX = /^(---|\+\+\+)\s*\r?\n([\s\S]*?)\r?\n\1\s*(?:\r?\n|$)/;
const TEMPLATER_TAG_REGEX = /<%[\s\S]*?%>/g;
const markdownParser = unified().use(remarkParse);

export { extractRawLinks, findLinkSpans, findRawLinkSpans, findWikilinkSpans, type PositionedLink } from "./link-spans";

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
      // With options, gray-matter parses afresh: without, it hands every caller of the same text one shared object,
      // so what one build writes into a note's frontmatter would show in the next build in the same process.
      : matter(`---\n${sanitizeFrontmatterSource(frontmatterSource)}\n---\n${bodyMarkdown}`, {}).data;
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

/** A generated description stops at the last whole sentence that fits; a longer first sentence stays whole. */
const DESCRIPTION_LENGTH = 300;
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** The first paragraph's text: top-level prose first, else one in a list or callout, else the whole body. */
function firstParagraph(markdown: string): string {
  const tree = markdownParser.parse(markdown.replace(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g, " "));
  const text = (node: Parameters<typeof toString>[0]) => toString(node, { includeHtml: false, includeImageAlt: false })
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replace(/^\[![\w-]+\][+-]?/, "")
    .replace(/\s+/g, " ")
    .trim();
  const paragraphs: string[] = [];
  visit(tree, "paragraph", (node) => {
    const value = text(node);
    if (value) paragraphs.push(value);
  });
  const topLevel = tree.children.find((node) => node.type === "paragraph" && text(node));
  return (topLevel && text(topLevel)) ?? paragraphs[0] ?? stripMarkdownToText(markdown);
}

/** A note's description from its first paragraph, cut at a sentence boundary. */
export const extractDescription = (markdown: string): string => {
  let description = "";
  for (const { segment } of sentenceSegmenter.segment(firstParagraph(markdown))) {
    if (description && (description + segment).trim().length > DESCRIPTION_LENGTH) break;
    description += segment;
  }
  return description.trim();
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

/**
 * Markdown parsing utilities — ported from @svartz/vault parse.ts.
 * Kept Effect-free for plugin authors.
 */

import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import type { RawLink, TocEntry } from "@svartz/core";

const FRONTMATTER_BLOCK_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const TEMPLATER_TAG_REGEX = /<%[\s\S]*?%>/g;

function sanitizeFrontmatterSource(frontmatterSource: string): string {
  return frontmatterSource.replace(TEMPLATER_TAG_REGEX, "svartz-templater");
}

export const extractFrontmatter = (
  content: string,
): { frontmatter?: Record<string, unknown>; bodyMarkdown: string } => {
  const frontmatterMatch = FRONTMATTER_BLOCK_REGEX.exec(content);
  if (!frontmatterMatch) {
    return {
      frontmatter: undefined,
      bodyMarkdown: content,
    };
  }

  const frontmatterSource = frontmatterMatch[1]!;
  const bodyMarkdown = content.slice(frontmatterMatch[0].length);

  try {
    const result = matter(`---\n${sanitizeFrontmatterSource(frontmatterSource)}\n---\n${bodyMarkdown}`);
    return {
      frontmatter: result.data as Record<string, unknown>,
      bodyMarkdown,
    };
  } catch {
    return {
      frontmatter: undefined,
      bodyMarkdown,
    };
  }
};

export const extractRawLinks = (markdown: string): RawLink[] => {
  const links: RawLink[] = [];

  const wikilinkRegex = /(?<!!)\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = wikilinkRegex.exec(markdown)) !== null) {
    const inner = match[1]!;
    const [targetWithSection, ...labelParts] = inner.split("|");
    const label = labelParts.length > 0 ? labelParts.join("|") : undefined;
    const [target, section] = targetWithSection!.split("#");

    if (
      target &&
      (target.startsWith("http://") || target.startsWith("https://"))
    ) {
      continue;
    }

    links.push({
      raw: match[0],
      target: target ?? "",
      section: section ?? undefined,
      label,
      type: "wikilink",
    });
  }

  const mdLinkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const href = match[2]!;

    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:")
    ) {
      continue;
    }

    const [target, section] = href.split("#");
    links.push({
      raw: match[0],
      target: target ?? "",
      section: section ?? undefined,
      label: match[1] ?? undefined,
      type: "markdown",
    });
  }

  return links;
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
  const slugger = new GithubSlugger();
  const toc: TocEntry[] = [];
  const lines = markdown.split("\n");
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const text = match[2]!
      .replace(/!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_m, target, label) => label ?? target)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (text.length === 0) continue;

    toc.push({
      depth: match[1]!.length,
      text,
      slug: slugger.slug(text),
    });
  }

  return toc;
};

export const extractSectionMarkdown = (
  markdown: string,
  headingSlug: string,
): string | undefined => {
  const lines = markdown.split("\n");
  const slugger = new GithubSlugger();
  let inCodeFence = false;
  let startIndex = -1;
  let startDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    if (slugger.slug(match[2]!.trim()) !== headingSlug) continue;
    startIndex = index;
    startDepth = match[1]!.length;
    break;
  }

  if (startIndex === -1) return undefined;

  inCodeFence = false;
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && match[1]!.length <= startDepth) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trim();
};

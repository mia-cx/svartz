import matter from "gray-matter";
import type { FrontmatterData, LinkMatch } from "../types.js";

/**
 * Parse frontmatter and body from raw file content using gray-matter.
 * Quartz uses gray-matter: github.com/jonschlinkert/gray-matter
 */
export const extractFrontmatter = (
  content: string,
): { frontmatter: FrontmatterData; bodyMarkdown: string } => {
  const result = matter(content);
  return {
    frontmatter: result.data as FrontmatterData,
    bodyMarkdown: result.content,
  };
};

/**
 * Get title from frontmatter or derive from filename.
 * Quartz reference: packages/reference/quartz/processors/parse.ts
 */
export const extractTitle = (
  frontmatter: FrontmatterData,
  filename: string,
  titleField = "title",
): string => {
  const fmTitle = frontmatter[titleField];
  if (typeof fmTitle === "string" && fmTitle.length > 0) return fmTitle;
  return filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

/**
 * Extract first 2-3 sentences as a description.
 */
export const extractDescription = (markdown: string): string => {
  const stripped = markdown
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_m, _target, label) => label ?? _target)
    .trim();

  const sentences = stripped.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return stripped.slice(0, 200).trim();
  return sentences.slice(0, 3).join("").trim().slice(0, 300);
};

/**
 * Extract all heading texts from markdown for TOC / search indexing.
 */
export const extractHeadings = (markdown: string): string[] => {
  const headings: string[] = [];
  const regex = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const text = match[1]?.trim();
    if (text) headings.push(text);
  }
  return headings;
};

/**
 * Extract all external URLs from markdown.
 * Quartz reference: packages/reference/quartz/plugins/transformers/links.ts
 */
export const extractExternalLinks = (markdown: string): string[] => {
  const links: Set<string> = new Set();

  const markdownLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(markdown)) !== null) {
    if (match[2]) links.add(match[2]);
  }

  const bareUrlRegex = /(?<!\()(https?:\/\/[^\s<>)\]]+)/g;
  while ((match = bareUrlRegex.exec(markdown)) !== null) {
    if (match[1]) links.add(match[1]);
  }

  const mailtoRegex = /mailto:([^\s<>)\]]+)/g;
  while ((match = mailtoRegex.exec(markdown)) !== null) {
    if (match[0]) links.add(match[0]);
  }

  return [...links];
};

/**
 * Extract all wikilinks and internal markdown links as unparsed LinkMatch objects.
 * Does NOT resolve — just finds and parses [[...]] and [...](...)
 * Quartz reference: packages/reference/quartz/plugins/transformers/links.ts
 */
export const extractRawLinks = (markdown: string): LinkMatch[] => {
  const links: LinkMatch[] = [];

  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = wikilinkRegex.exec(markdown)) !== null) {
    const inner = match[1]!;
    const [targetWithSection, ...labelParts] = inner.split("|");
    const label = labelParts.length > 0 ? labelParts.join("|") : undefined;
    const [target, section] = targetWithSection!.split("#");

    if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
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

/**
 * Count words in markdown body.
 */
export const countWords = (markdown: string): number => {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g, (_m, _target, label) => label ?? _target)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>]/g, "")
    .trim();

  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
};

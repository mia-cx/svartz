/**
 * Markdown parsing utilities — ported from @svartz/vault parse.ts.
 * Kept Effect-free for plugin authors.
 */

import matter from "gray-matter";
import type { RawLink } from "@svartz/core";

export const extractFrontmatter = (
  content: string,
): { frontmatter: Record<string, unknown>; bodyMarkdown: string } => {
  const result = matter(content);
  return {
    frontmatter: result.data as Record<string, unknown>,
    bodyMarkdown: result.content,
  };
};

export const extractRawLinks = (markdown: string): RawLink[] => {
  const links: RawLink[] = [];

  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
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

export const extractDescription = (markdown: string): string => {
  const stripped = markdown
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(
      /!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g,
      (_m, _target, label) => label ?? _target,
    )
    .trim();

  const sentences = stripped.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return stripped.slice(0, 200).trim();
  return sentences.slice(0, 3).join("").trim().slice(0, 300);
};

export const countWords = (markdown: string): number => {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(
      /!?\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g,
      (_m, _target, label) => label ?? _target,
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>]/g, "")
    .trim();

  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
};

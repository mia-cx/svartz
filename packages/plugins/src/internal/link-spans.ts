/**
 * Where a note's authored links are, as source spans. Apart from `parse.ts` so the editor preview can run it in the
 * browser without gray-matter.
 */

import type { RawLink } from "@svartz/core";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

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

export type PositionedLink = RawLink & {
  start: number;
  end: number;
  /** A Markdown link's destination span, so a rewrite can keep its label markup and title. */
  destination?: { start: number; end: number };
};

/** The destination after a link's `](`: `<…>`, or a run without spaces that balances parentheses. */
function destinationSpan(markdown: string, from: number): { start: number; end: number } {
  // A destination may start on the next line, after that line's blockquote markers.
  const start = from + /^[ \t]*(?:\r?\n(?:[ \t]*>)*[ \t]*)?/.exec(markdown.slice(from))![0].length;
  if (markdown[start] === "<") return { start, end: markdown.indexOf(">", start) + 1 };
  let depth = 0;
  let end = start;
  for (; end < markdown.length; end += 1) {
    const char = markdown[end]!;
    if (char === "\\") end += 1;
    else if (/\s/.test(char) || (char === ")" && depth === 0)) break;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
  }
  return { start, end };
}

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
    // The label's last child ends at its `]`, so `](` follows it.
    const labelEnd = node.children.at(-1)?.position?.end.offset ?? start + 1;
    links.push({
      raw: markdown.slice(start, end), target: target ?? "", section: section || undefined,
      label: toString(node), type: "markdown", start, end,
      destination: destinationSpan(markdown, labelEnd + 2),
    });
    return SKIP;
  });
  return links;
}

/** Authored wikilinks and Markdown links with source spans; excludes code, embeds, escaped text, and raw HTML. */
export const findLinkSpans = (markdown: string): PositionedLink[] => collectLinkSpans(markdown);

/** Authored wikilinks with source spans; excludes code, embeds, escaped text, and raw HTML. */
export const findWikilinkSpans = (markdown: string): PositionedLink[] =>
  collectLinkSpans(markdown).filter((link) => link.type === "wikilink");

export const extractRawLinks = (markdown: string, roamReserved = false): RawLink[] =>
  collectLinkSpans(markdown, roamReserved).map(({ start: _start, end: _end, ...link }) => link);

/** Source spans for authored links; excludes code, embeds, escaped text, and raw HTML. */
export function findRawLinkSpans(markdown: string, raw: string, type: RawLink["type"], roamReserved = false): { start: number; end: number }[] {
  return collectLinkSpans(markdown, roamReserved)
    .filter((link) => link.raw === raw && link.type === type)
    .map(({ start, end }) => ({ start, end }));
}

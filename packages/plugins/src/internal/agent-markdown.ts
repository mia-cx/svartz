/**
 * Markdown copies of published pages for LLM agents. Each copy starts from the
 * author's source, so math stays TeX and callouts stay callouts. Anything the
 * page hides stays out: Obsidian and HTML comments, and `.svx` script and style.
 */
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { posix } from "node:path";
import type { ProcessedFile } from "@svartz/core";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { htmlAssetSpans, maskHiddenComments, referenceDefinitionSpans } from "./asset-references";
import { findLinkSpans } from "./parse";
import { IMAGE_EXTENSIONS, splitEmbedInner } from "../transform-embeds";

const markdownParser = unified().use(remarkParse);
const EMBED = /!\[\[([^\]]+)\]\]/g;
const SVX_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
// `![[photo.png|300]]` sizes an image; it is not alt text.
const IMAGE_SIZE = /^\d+(?:x\d+)?$/;

export interface AgentMarkdownLinks {
  /** URL for a resolved note link: its Markdown copy, or its page when it has none. Undefined hides the link. */
  note(target: { target: string; section?: string; type: "wikilink" | "markdown" }): string | undefined;
  /** URL for a public vault attachment named from this note. */
  asset(target: string): string | undefined;
}

interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const anchor = (section: string | undefined): string =>
  section ? `#${new GithubSlugger().slug(section)}` : "";

const escapeLabel = (label: string): string => label.replace(/[[\]]/g, "\\$&");

/** An attachment keeps its authored `?query#fragment` verbatim, such as `manual.pdf#page=3`. Only note sections are heading slugs. */
const assetUrl = (links: AgentMarkdownLinks, target: string): string | undefined => {
  const url = links.asset(target);
  return url && `${url}${/[?#].*$/.exec(target)?.[0] ?? ""}`;
};

/** A reference definition's destination, rewritten like an inline link's. Undefined keeps it as authored. */
function definitionUrl(target: string, links: AgentMarkdownLinks): string | undefined {
  const asset = assetUrl(links, target);
  if (asset) return asset;
  const [path = "", section] = target.split("#");
  const url = links.note({ target: path, section: section || undefined, type: "markdown" });
  return url && `${url}${anchor(section)}`;
}

function embedReplacements(source: string, links: AgentMarkdownLinks): Replacement[] {
  const replacements: Replacement[] = [];
  visit(markdownParser.parse(source), (node) => {
    const start = node.position?.start.offset;
    if (start === undefined) return;
    if (node.type === "image") {
      const url = assetUrl(links, node.url);
      if (url) replacements.push({ start, end: node.position!.end.offset!, text: `![${escapeLabel(node.alt ?? "")}](${url})` });
      return;
    }
    if (node.type === "html") {
      for (const span of htmlAssetSpans(node.value)) {
        const url = assetUrl(links, span.target);
        // A tag inside a blockquote or list loses its markers in `value`, so its offsets may not match the source.
        if (!url || source.slice(start + span.start, start + span.end) !== span.target) continue;
        replacements.push({ start: start + span.start, end: start + span.end, text: url });
      }
      return;
    }
    if (node.type !== "text") return;
    for (const match of node.value.matchAll(EMBED)) {
      const offset = start + match.index!;
      if (source.slice(offset, offset + match[0].length) !== match[0]) continue;
      const { target, section, alias } = splitEmbedInner(match[1]!);
      const label = alias && !IMAGE_SIZE.test(alias) ? alias : undefined;
      const asset = assetUrl(links, section ? `${target}#${section}` : target);
      const text = asset
        ? IMAGE_EXTENSIONS.has(posix.extname(target).toLowerCase())
          ? `![${escapeLabel(label ?? "")}](${asset})`
          : `[${escapeLabel(label ?? posix.basename(target))}](${asset})`
        : noteLink(links.note({ target, section, type: "wikilink" }), label ?? target);
      replacements.push({ start: offset, end: offset + match[0].length, text });
    }
  });
  return replacements;
}

const noteLink = (url: string | undefined, label: string): string =>
  url ? `[${escapeLabel(label)}](${url})` : label;

/** Drop the blank runs that hidden comments leave behind. Code keeps its whitespace, since it may be data. */
function tidyOutsideCode(markdown: string): string {
  const tidy = (text: string) => text.replace(/^[ \t]+\n/gm, "\n").replace(/\n{3,}/g, "\n\n");
  let tidied = "";
  let cursor = 0;
  visit(markdownParser.parse(markdown), "code", (node) => {
    const start = node.position!.start.offset!;
    const end = node.position!.end.offset!;
    tidied += tidy(markdown.slice(cursor, start)) + markdown.slice(start, end);
    cursor = end;
  });
  return (tidied + tidy(markdown.slice(cursor))).replace(/^\n+/, "").trimEnd();
}

/**
 * One page's Markdown copy: its published properties as YAML front matter, the title
 * as a heading unless the body opens with one, then the source with links rewritten.
 * Structured themes (API models, symbol docs) render from those properties, so the
 * copy keeps them. The index already publishes them, so they reveal nothing new.
 */
export function agentMarkdown(
  file: ProcessedFile,
  source: string,
  page: { readonly title: string; readonly properties: Readonly<Record<string, unknown>> },
  links: AgentMarkdownLinks,
): string {
  const visible = maskHiddenComments(file.extension === ".svx" ? source.replace(SVX_BLOCK, "") : source);
  const replacements: Replacement[] = [
    ...findLinkSpans(visible).flatMap((link): Replacement[] => {
      const label = link.label ?? link.target;
      const asset = assetUrl(links, link.section ? `${link.target}#${link.section}` : link.target);
      if (asset) return [{ start: link.start, end: link.end, text: `[${escapeLabel(label)}](${asset})` }];
      const url = links.note(link);
      // An unresolved Markdown link stays as authored; an unresolved wikilink becomes its label, as on the page.
      if (!url && link.type === "markdown") return [];
      return [{ start: link.start, end: link.end, text: noteLink(url && `${url}${anchor(link.section)}`, label) }];
    }),
    ...referenceDefinitionSpans(visible).flatMap(({ start, end, target }): Replacement[] => {
      const url = definitionUrl(target, links);
      return url ? [{ start, end, text: url }] : [];
    }),
    ...embedReplacements(visible, links),
  ].sort((left, right) => right.start - left.start);

  let body = visible;
  let limit = Infinity;
  for (const { start, end, text } of replacements) {
    // A link wrapping an already rewritten image keeps its authored URL rather than clobber the image.
    if (end > limit) continue;
    body = body.slice(0, start) + text + body.slice(end);
    limit = start;
  }
  body = tidyOutsideCode(body);

  const content = `${/^#\s/.test(body) ? body : `# ${page.title}\n\n${body}`}`.trim();
  return Object.keys(page.properties).length > 0
    ? `${matter.stringify("", { ...page.properties }).trim()}\n\n${content}\n`
    : `${content}\n`;
}

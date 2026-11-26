/**
 * Markdown copies of published pages for LLM agents. Each copy starts from the
 * author's source, so math stays TeX and callouts stay callouts. Anything the
 * page hides stays out: Obsidian and HTML comments, and `.svx` script and style.
 */
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { posix } from "node:path";
import type { ProcessedFile } from "@svartz/core";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { hiddenCommentSpans, htmlAssetSpans, maskHiddenComments, referenceDefinitionSpans } from "./asset-references";
import { findLinkSpans } from "./parse";
import { IMAGE_EXTENSIONS, splitEmbedInner } from "./attachments";

const markdownParser = unified().use(remarkParse);
const EMBED = /!\[\[([^\]]+)\]\]/g;
const SVX_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
// `![[photo.png|300]]` sizes an image; it is not alt text.
const IMAGE_SIZE = /^\d+(?:x\d+)?$/;
const NOTE_FILE = /\.(?:md|mdx|svx)$/i;

export interface AgentMarkdownLinks {
  /** URL for a resolved note link: its Markdown copy, or its page when it has none. Undefined hides the link. */
  note(target: { target: string; section?: string; type: "wikilink" | "markdown" }): string | undefined;
  /** URL for a public vault attachment named from this note. */
  asset(target: string): string | undefined;
  /** URL for a relative destination that names neither, such as a host route. Without it, such links stay as authored. */
  path?(target: string): string | undefined;
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
  // External URLs stay as authored, like inline ones; the note resolver's basename fallback would claim them.
  if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith("//")) return undefined;
  const asset = assetUrl(links, target);
  if (asset) return asset;
  const [path = "", section] = target.split("#");
  const url = links.note({ target: path, section: section || undefined, type: "markdown" });
  return url ? `${url}${anchor(section)}` : links.path?.(target);
}

function embedReplacements(source: string, links: AgentMarkdownLinks): Replacement[] {
  const replacements: Replacement[] = [];
  visit(markdownParser.parse(source), (node) => {
    const start = node.position?.start.offset;
    if (start === undefined) return;
    if (node.type === "image") {
      const url = assetUrl(links, node.url) ?? links.path?.(node.url);
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
 * A note's source as portable Markdown: hidden comments and `.svx` script and style removed,
 * wikilinks, embeds and Markdown links rewritten to the URLs `links` gives.
 */
export function portableMarkdown(file: ProcessedFile, source: string, links: AgentMarkdownLinks): string {
  const executable = file.extension === ".svx";
  const shown = executable ? source.replace(SVX_BLOCK, "") : source;
  const visible = maskHiddenComments(shown, executable);
  const replacements: Replacement[] = [
    // Comments go entirely, so text after one stays where it was instead of behind a run of spaces.
    ...hiddenCommentSpans(shown, executable).map(({ start, end }) => ({ start, end, text: "" })),
    ...findLinkSpans(visible).flatMap((link): Replacement[] => {
      const label = link.label ?? link.target;
      const asset = assetUrl(links, link.section ? `${link.target}#${link.section}` : link.target);
      const note = asset ? undefined : links.note(link);
      const url = asset ?? (note && `${note}${anchor(link.section)}`);
      // A Markdown link swaps only its destination, keeping its label markup and title.
      if (link.destination && url) return [{ ...link.destination, text: url }];
      const path = link.destination && links.path?.(link.section ? `${link.target}#${link.section}` : link.target);
      if (link.destination && path) return [{ ...link.destination, text: path }];
      // A Markdown link to another path, such as a host route, stays as authored. One to a note that
      // isn't public becomes its label, like a wikilink, rather than a link to a file that isn't published.
      if (link.destination && !NOTE_FILE.test(link.target)) return [];
      // An unresolved wikilink becomes its label, as on the page.
      return [{ start: link.start, end: link.end, text: noteLink(url, label) }];
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
  return tidyOutsideCode(body);
}

/**
 * One page's Markdown copy: its transformed frontmatter (including display defaults), the title
 * as a heading unless the body opens with one, then the source with links rewritten.
 * Structured themes (API models, symbol docs) render from those properties, so the
 * copy keeps them alongside the generated title and description.
 */
export function agentMarkdown(
  file: ProcessedFile,
  source: string,
  page: { readonly title: string; readonly properties: Readonly<Record<string, unknown>> },
  links: AgentMarkdownLinks,
): string {
  const body = portableMarkdown(file, source, links);
  const content = `${/^#\s/.test(body) ? body : `# ${page.title}\n\n${body}`}`.trim();
  return Object.keys(page.properties).length > 0
    ? `${matter.stringify("", { ...page.properties }).trim()}\n\n${content}\n`
    : `${content}\n`;
}

const gfmParser = unified().use(remarkParse).use(remarkGfm);
/** A reference or footnote label at the start of its definition: `[doc]:` or `[^1]:`. */
const DEFINITION_LABEL = /^\[\^?(?:\\.|[^\\\]])+\]/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A copy that still means the same once joined with others into one document, as in `llms-full.txt`. Each reference
 * and footnote label gets the `scope` prefix, so a definition binds only the page that wrote it, and a fence the page
 * leaves open closes at its end instead of swallowing the next page.
 */
export function selfContained(markdown: string, scope: string): string {
  const tree = gfmParser.parse(markdown);
  const label = (identifier: string) => `${scope}:${identifier}`;
  const replacements: Replacement[] = [];
  visit(tree, (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (node.type === "linkReference" || node.type === "imageReference") {
      // Only the label after the text changes: `[text][doc]`, `[text][]`, and the shortcut `[doc]` all become `[text][scope:doc]`.
      const from = node.referenceType === "full" ? markdown.lastIndexOf("[", end - 1) : node.referenceType === "collapsed" ? end - 2 : end;
      replacements.push({ start: from, end, text: `[${label(node.identifier)}]` });
    } else if (node.type === "footnoteReference") {
      replacements.push({ start, end, text: `[^${label(node.identifier)}]` });
    } else if (node.type === "definition" || node.type === "footnoteDefinition") {
      const own = DEFINITION_LABEL.exec(markdown.slice(start))?.[0];
      if (own) replacements.push({ start, end: start + own.length, text: node.type === "definition" ? `[${label(node.identifier)}]` : `[^${label(node.identifier)}]` });
    }
  });
  let body = markdown;
  for (const { start, end, text } of replacements.sort((left, right) => right.start - left.start)) {
    body = body.slice(0, start) + text + body.slice(end);
  }

  // Only a fence at the top level runs on: the blank line before the next page ends any list or quote around one.
  const last = tree.children.at(-1);
  if (last?.type !== "code") return body;
  const lines = markdown.slice(last.position!.start.offset, last.position!.end.offset).split("\n");
  const fence = FENCE.exec(lines[0]!)?.[1];
  const closed = lines.length > 1 && new RegExp(`^ {0,3}\\${fence?.[0]}{${fence?.length},}\\s*$`).test(lines.at(-1)!);
  return fence === undefined || closed ? body : `${body.trimEnd()}\n${fence}\n`;
}

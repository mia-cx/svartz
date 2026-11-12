/**
 * Renders a note's Markdown in the browser as the build would, for the submissions editor's Split mode: GitHub
 * Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published
 * notes. What only the build can do falls back: code stays unhighlighted, math and diagrams stay their source, a note
 * embed shows its link without the note's body, and an attachment embed shows as code.
 *
 * Browser-safe: nothing here reads files or imports Node built-ins.
 */
import type { LinkResolutionStrategy } from "@svartz/core";
import GithubSlugger from "github-slugger";
import type { Root } from "hast";
import { toHtml } from "hast-util-to-html";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { findLinkSpans, replaceEmbeds, type PositionedLink } from "./internal/link-spans";
import { markdownProcessor } from "./internal/markdown-processor";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { fileToSlug } from "./internal/slug";
import { transformMarkdown } from "./internal/ofm";

/** A published note a preview's links can name. */
export interface PreviewNote {
  readonly slug: string;
  /** Its file's path inside the vault, `.md` included. */
  readonly path: string;
  /** Its URL path below the deployment base, as the index lists it. */
  readonly href: string;
  readonly title: string;
  readonly aliases?: readonly string[];
}

export interface PreviewOptions {
  /** The notes links resolve to; any other link shows unresolved. */
  readonly notes: readonly PreviewNote[];
  readonly linkResolution: LinkResolutionStrategy;
  /** The previewed note's path inside the vault, `.md` included: relative links and `closest` resolve from it. */
  readonly path: string;
  /** SvelteKit's deployment base, which every link's URL starts with. */
  readonly base: string;
  /** The vault's mount path, `""` at the site's root: attachment URLs start with it. */
  readonly mountPath: string;
  /** The theme's tags route, as `theme.routes.tags`. */
  readonly tagsRoute?: string;
}

/** As `parse.ts` reads it: YAML or TOML between fences on the first line. */
const FRONTMATTER = /^(---|\+\+\+)\s*\r?\n([\s\S]*?)\r?\n\1\s*(?:\r?\n|$)/;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** `markdown` as the build hands it to the Markdown compiler, for a preview of the note at `options.path`. */
function prepare(markdown: string, options: PreviewOptions): string {
  const { notes, linkResolution, path, base } = options;
  const slugMap = buildSlugMap(notes);
  const slugs = notes.map((note) => note.slug);
  const hrefs = new Map(notes.map((note) => [note.slug, note.href]));
  const sourceSlug = notes.find((note) => note.path === path)?.slug ?? fileToSlug(path);
  const resolve = (link: Pick<PositionedLink, "target" | "type">) =>
    resolveLink({ raw: "", ...link }, slugMap, slugs, linkResolution, sourceSlug, notes);
  const url = (slug: string, section?: string) => `${base}${hrefs.get(slug)}${section ? `#${new GithubSlugger().slug(section)}` : ""}`;

  // core:parse-frontmatter, then core:resolve-links: published notes link, other wikilinks show unresolved.
  const body = markdown.replace(FRONTMATTER, "");
  const linked = findLinkSpans(body).reduceRight((content, link) => {
    const slug = resolve(link);
    const label = escapeHtml(link.label ?? link.target);
    const html = slug !== null
      ? `<a href="${escapeHtml(url(slug, link.section))}">${label}</a>`
      : link.type === "wikilink"
      ? `<span class="svartz-unresolved-link" role="link" aria-disabled="true">${label}</span>`
      : undefined;
    return html === undefined ? content : content.slice(0, link.start) + html + content.slice(link.end);
  }, body);

  // core:transform-ofm, then core:transform-embeds without the embedded body, which only the build can read.
  const { content } = transformMarkdown(linked, sourceSlug, options.tagsRoute ?? "tags", false);
  const embedded = replaceEmbeds(content, (raw, inner) => {
    const [targetWithSection = "", ...label] = inner.split("|");
    const [target = "", section] = targetWithSection.split("#");
    const slug = resolve({ target: target.trim(), type: "wikilink" });
    if (slug === null) return `\`${raw}\``;
    const title = label.join("|").trim() || notes.find((note) => note.slug === slug)!.title;
    return `<div class="svartz-embed" data-embed="${escapeHtml(slug)}"><p class="svartz-embed-source"><a href="${escapeHtml(url(slug, section?.trim()))}">${escapeHtml(title)}</a></p></div>`;
  });
  return embedded;
}

/**
 * The note's HTML, rendered from `markdown` (frontmatter and all) as the site would render its body. Relative URLs
 * left after link resolution name attachments: they resolve from the note's folder to where the build publishes
 * attachments, `<base><mount>/<vault path>`, so they work wherever the preview shows.
 */
export async function renderPreview(markdown: string, options: PreviewOptions): Promise<string> {
  const processor = markdownProcessor([remarkGfm]);
  const tree = await processor.run(processor.parse(prepare(markdown, options))) as Root;
  const folder = `https://preview.invalid/${options.path.slice(0, options.path.lastIndexOf("/") + 1)}`;
  visit(tree, "element", (node) => {
    for (const name of ["href", "src"] as const) {
      const value = node.properties[name];
      if (typeof value !== "string" || !value || value.startsWith("#") || value.startsWith("/") || SCHEME.test(value)) continue;
      const resolved = new URL(value, folder);
      node.properties[name] = `${options.base}${options.mountPath}${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
  });
  return toHtml(tree);
}

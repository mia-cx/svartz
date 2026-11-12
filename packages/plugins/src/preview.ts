/**
 * Renders a note's Markdown in the browser as the build would, for the submissions editor's Split mode: GitHub
 * Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published
 * notes and attachments. What only the build can do falls back: code stays unhighlighted, math and diagrams stay their
 * source, and a note embed shows its link without the note's body.
 *
 * Browser-safe: nothing here reads files or imports Node built-ins.
 */
import type { LinkResolutionStrategy } from "@svartz/core";
import GithubSlugger from "github-slugger";
import type { Root } from "hast";
import { toHtml } from "hast-util-to-html";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { attachmentResolver, encodeAttachmentPath, renderAssetEmbed, splitEmbedInner, urlSuffix } from "./internal/attachments";
import { findLinkSpans, replaceEmbeds, type PositionedLink } from "./internal/link-spans";
import { markdownProcessor } from "./internal/markdown-processor";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { routeHref } from "./internal/routes";
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
  /** The vault paths of the attachments the site publishes; links and embeds naming any other file stay unresolved. */
  readonly attachments: readonly string[];
  /** The theme's tags route, as `theme.routes.tags`. */
  readonly tagsRoute?: string;
}

/** As `parse.ts` reads it: YAML or TOML between fences on the first line. */
const FRONTMATTER = /^(---|\+\+\+)\s*\r?\n([\s\S]*?)\r?\n\1\s*(?:\r?\n|$)/;
/** A URL with a scheme, or protocol-relative: it leaves the site. */
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** The attachment a link target names: its vault path, and the URL the build publishes it at. */
type Attachment = (target: string) => { readonly path: string; readonly href: string } | undefined;

/** `markdown` as the build hands it to the Markdown compiler, for a preview of the note `sourceSlug`. */
function prepare(markdown: string, options: PreviewOptions, sourceSlug: string, attachment: Attachment, generated: Set<string>): string {
  const { notes, linkResolution, base } = options;
  const slugMap = buildSlugMap(notes);
  const slugs = notes.map((note) => note.slug);
  const hrefs = new Map(notes.map((note) => [note.slug, note.href]));
  const resolve = (link: Pick<PositionedLink, "target" | "type">) =>
    resolveLink({ raw: "", ...link }, slugMap, slugs, linkResolution, sourceSlug, notes);
  const url = (slug: string, section?: string) => {
    const href = `${base}${hrefs.get(slug)}${section ? `#${new GithubSlugger().slug(section)}` : ""}`;
    generated.add(href);
    return href;
  };

  // core:parse-frontmatter, then core:resolve-links: attachments and published notes link, other wikilinks show
  // unresolved. Markdown links to attachments resolve with the page's other URLs, in renderPreview.
  const body = markdown.replace(FRONTMATTER, "");
  const linked = findLinkSpans(body).reduceRight((content, link) => {
    const label = escapeHtml(link.label ?? link.target);
    const asset = link.type === "wikilink" ? attachment(link.section ? `${link.target}#${link.section}` : link.target)?.href : undefined;
    const slug = asset === undefined ? resolve(link) : null;
    const href = asset ?? (slug !== null ? url(slug, link.section) : undefined);
    const html = href !== undefined
      ? `<a href="${escapeHtml(href)}">${label}</a>`
      : link.type === "wikilink"
      ? `<span class="svartz-unresolved-link" role="link" aria-disabled="true">${label}</span>`
      : undefined;
    return html === undefined ? content : content.slice(0, link.start) + html + content.slice(link.end);
  }, body);

  // core:transform-ofm, then core:transform-embeds without the embedded body, which only the build can read.
  const { content } = transformMarkdown(linked, sourceSlug, options.tagsRoute ?? "tags", false);
  return replaceEmbeds(content, (raw, inner) => {
    const { target, section, alias } = splitEmbedInner(inner);
    const asset = attachment(target);
    if (asset !== undefined) return renderAssetEmbed(asset.href, asset.path, alias);
    const slug = resolve({ target, type: "wikilink" });
    if (slug === null) return `\`${raw}\``;
    const title = alias ?? notes.find((note) => note.slug === slug)!.title;
    return `<div class="svartz-embed" data-embed="${escapeHtml(slug)}"><p class="svartz-embed-source"><a href="${escapeHtml(url(slug, section))}">${escapeHtml(title)}</a></p></div>`;
  });
}

/**
 * The note's HTML, rendered from `markdown` (frontmatter and all) as the site would render its body. A URL naming one
 * of `options.attachments`, by the build's rules, links to where the build publishes it: `<base><mount>/<vault path>`.
 * Any other relative URL resolves from the note's page, as on the site.
 */
export async function renderPreview(markdown: string, options: PreviewOptions): Promise<string> {
  const { notes, path, base, mountPath } = options;
  const note = notes.find((candidate) => candidate.path === path);
  const sourceSlug = note?.slug ?? fileToSlug(path);
  const resolveAttachment = attachmentResolver(options.attachments);
  // URLs the preview wrote itself: they name pages and attachments already, so the pass below leaves them alone.
  const generated = new Set<string>();
  const attachment: Attachment = (target) => {
    const asset = resolveAttachment(path, target);
    if (asset === undefined) return;
    const href = `${base}${mountPath}/${encodeAttachmentPath(asset)}${urlSuffix(target)}`;
    generated.add(href);
    return { path: asset, href };
  };

  const processor = markdownProcessor([remarkGfm]);
  const tree = await processor.run(processor.parse(prepare(markdown, options, sourceSlug, attachment, generated))) as Root;
  const page = new URL(`${base}${note?.href ?? routeHref(sourceSlug, mountPath)}`, "https://preview.invalid");
  visit(tree, "element", (node) => {
    for (const name of ["href", "src"] as const) {
      const value = node.properties[name];
      if (typeof value !== "string" || !value || value.startsWith("#") || generated.has(value) || EXTERNAL.test(value)) continue;
      const asset = attachment(value);
      if (asset !== undefined) {
        node.properties[name] = asset.href;
      } else if (!value.startsWith("/")) {
        const resolved = new URL(value, page);
        node.properties[name] = `${resolved.pathname}${resolved.search}${resolved.hash}`;
      }
    }
  });
  return toHtml(tree);
}

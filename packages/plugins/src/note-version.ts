/**
 * Compiling another version of a published note, such as an earlier one from git, exactly as the build compiles the
 * note itself: the vault's own plugins run their frontmatter, link, OFM, embed and compiler steps on it, against the
 * notes and attachments this build publishes, and it renders with the build's Markdown compiler and sanitizer.
 */
import { getCompilerContributions, runStages, STAGE_NAMES, type PluginContext, type ProcessedFile } from "@svartz/core";
import type { Element } from "hast";
import { visit } from "unist-util-visit";
import { referencedAssets } from "./internal/asset-references";
import { compileContent } from "./internal/compile-content";
import { renderMarkdownTree } from "./internal/render-markdown";

/** The stages that turn a parsed note into the Markdown the compiler reads, in pipeline order. */
const CONTENT_STAGES = STAGE_NAMES.slice(STAGE_NAMES.indexOf("resolveLinks"), STAGE_NAMES.indexOf("transformEmbeds") + 1);

/** A URL that names a scheme, the site root or a place on the same page stays as written. */
const ANCHORED = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i;

/** What {@link compileNoteVersion} answers. */
export interface CompiledNoteVersion {
  /** The version's body as Svelte markup, as a note page's component holds it, taking `contentComponents`. */
  readonly markup: string;
  /** The vault paths of the attachments among `options.attachments` the version references that the build doesn't keep. */
  readonly attachments: readonly string[];
}

/**
 * Compiles `markdown`, a version of the published note `note` that sat at `path` in the vault, as the build compiles
 * the note: run `ctx.plugins`' `parseFrontmatter` stage on it alone, then their link, OFM and embed stages on it
 * among the notes and attachments the build publishes, then the compiler steps those stages contributed. The version
 * takes the note's place and route, and links resolve as they do from the note now.
 *
 * `attachments` are vault files the version may reference beyond the published ones; those it references join the
 * attachments its links resolve against, and are answered: the caller publishes them. `prefix` leads every relative
 * URL in the output, for a page below the note's own URL: `../../` for one two folders down. A relative link or
 * source naming nothing `published` holds, read from the note's URL `note.href`, shows unresolved instead. Call it
 * after `core:index`, from `emitArtifacts`. Browser resources the version's steps add, such as diagrams', join the
 * build's.
 */
export async function compileNoteVersion(
  ctx: PluginContext,
  note: { readonly slug: string; readonly path: string; readonly href: string },
  version: { readonly path: string; readonly markdown: string },
  options: {
    readonly attachments: readonly ProcessedFile[];
    readonly prefix: string;
    /** Whether the site publishes a page or file at `pathname`, decoded, below the deployment base. */
    readonly published: (pathname: string) => boolean;
  },
): Promise<CompiledNoteVersion> {
  const plugins = ctx.plugins ?? [];
  const file: ProcessedFile = { path: version.path, slug: note.slug, extension: ".md", content: version.markdown };
  const parsing: PluginContext = { config: ctx.config, plugins, files: [file], artifacts: new Map(), meta: new Map(ctx.meta) };
  await runStages(plugins, parsing, ["parseFrontmatter"]);

  // As `core:filter-unpublished` picks the attachments notes reference, among every one the build may publish. The
  // build already keeps some, protected notes' included: those stay as the build has them.
  const kept = new Set(ctx.files.filter((other) => !/\.(?:md|mdx|svx)$/i.test(other.path)).map(({ path }) => path));
  const candidates = options.attachments.filter(({ path }) => !kept.has(path));
  const referenced = referencedAssets([file], [...ctx.files.filter(({ path }) => kept.has(path)), ...candidates], ctx.meta.get("svartz:roamMedia") === true);
  const added = candidates.filter(({ path }) => referenced.has(path));

  // Every other published file stays a link and embed target. Their bodies were transformed already, and an embed
  // reads its target's source from `sourceBodies`, so they join empty.
  const others = ctx.files
    .filter((other) => other.path !== note.path)
    .map((other) => ({ ...other, content: "", rawLinks: [] }));
  const bodies = new Map(ctx.meta.get("sourceBodies") as ReadonlyMap<string, string> | undefined);
  bodies.set(file.path, file.content);
  const meta = new Map(parsing.meta);
  meta.set("sourceBodies", bodies);
  const compiling: PluginContext = { config: ctx.config, plugins, files: [file, ...others, ...added], artifacts: new Map(), meta, index: ctx.index };
  await runStages(plugins, compiling, CONTENT_STAGES);

  const tree = await renderMarkdownTree(compiling, file.content);
  // Whether a relative URL, read from the note's own page, names something the site publishes, or an attachment the
  // caller publishes for this version.
  const mine = new Set(added.map(({ path }) => `${ctx.config.mountPath ?? ""}/${path.replaceAll("\\", "/")}`));
  const resolves = (url: string) => {
    if (ANCHORED.test(url)) return true;
    const { pathname } = new URL(url, `https://svartz.invalid${note.href}`);
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    return mine.has(decoded) || options.published(decoded) || options.published(`${decoded}/`);
  };
  const relative = (url: string) => (ANCHORED.test(url) ? url : `${options.prefix}${url}`);
  visit(tree, "element", (node: Element, index, parent) => {
    const href = node.properties.href;
    const src = node.properties.src;
    const dead = (typeof href === "string" && href && !resolves(href)) || (typeof src === "string" && src && !resolves(src));
    if (dead && parent && index !== undefined) {
      // A version may link what the site no longer publishes, and no edit can fix it now: show it unresolved, as
      // the build shows a link to a missing note, rather than fail the crawl or publish the file.
      parent.children[index] = {
        type: "element",
        tagName: "span",
        properties: { className: ["svartz-unresolved-link"], role: "link", ariaDisabled: "true" },
        children: node.tagName === "a" ? node.children : [{ type: "text", value: String(node.properties.alt ?? "") }],
      };
      return;
    }
    for (const name of ["href", "src"] as const) {
      const value = node.properties[name];
      if (typeof value === "string" && value) node.properties[name] = relative(value);
    }
    const srcset = node.properties.srcSet;
    if (typeof srcset === "string" && srcset) {
      node.properties.srcSet = srcset.split(/,\s+/).filter((candidate) => resolves(candidate.trim().split(/\s/)[0]!))
        .map((candidate) => relative(candidate.trim())).join(", ");
    }
  });

  const resources = getCompilerContributions(ctx).browserResources;
  for (const [id, resource] of getCompilerContributions(compiling).browserResources) {
    if (!resources.has(id)) resources.set(id, resource);
  }
  return { markup: compileContent(tree), attachments: added.map(({ path }) => path) };
}

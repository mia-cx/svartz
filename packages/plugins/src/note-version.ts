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
/** A URL from the site's root, `/media/chart.svg`, as opposed to one naming another host, `//cdn.example/x`. */
const ROOT_RELATIVE = /^\/(?!\/)/;

/** A compiler step's plugin: the function itself, or the first of a `[plugin, options]` pair. */
const stepOf = (step: unknown): unknown => (Array.isArray(step) ? step[0] : step);

/**
 * The steps of `added` that `present` lacks. A plugin that registers a step builds it afresh on each run, sometimes
 * as a new closure, so a step counts as present when its plugin is the same function or has the same source.
 */
function missing<Step>(added: readonly Step[], present: readonly Step[]): Step[] {
  const plugins = present.map(stepOf);
  return added.filter((step) => {
    const plugin = stepOf(step);
    return !plugins.some((other) => other === plugin || (typeof other === "function" && typeof plugin === "function" && String(other) === String(plugin)));
  });
}

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
 * among the notes and attachments the build publishes, embedding them from the build's own sources, then compile it
 * with the build's compiler steps and any its own content alone needs. The version takes the note's place and route,
 * and links resolve as they do from the note now.
 *
 * `attachments` are vault files the version may reference beyond the published ones; those it references join the
 * attachments its links resolve against, and are answered: the caller publishes them, at their own path or where
 * `moved` says. `prefix` leads every other relative URL in the output, for a page below the note's own URL: `../../`
 * for one two folders down. A relative link or source naming nothing `published` holds, read from the note's URL
 * `note.href`, shows unresolved instead. Call it after `core:index`, from `emitArtifacts`. Browser resources the
 * version's steps add, such as diagrams', join the build's.
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
    /** Attachments the caller publishes somewhere other than their own path, by vault path: the URL, from the page, to link instead. */
    readonly moved?: ReadonlyMap<string, string>;
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
  // reads its target's source from the build's `sourceBodies`, so they join empty: the build's compiler steps, below,
  // already hold what their content needed.
  const others = ctx.files
    .filter((other) => other.path !== note.path)
    .map((other) => ({ ...other, content: "", rawLinks: [] }));
  const bodies = new Map(ctx.meta.get("sourceBodies") as ReadonlyMap<string, string> | undefined);
  bodies.set(file.path, file.content);
  const meta = new Map(parsing.meta);
  meta.set("sourceBodies", bodies);
  const compiling: PluginContext = { config: ctx.config, plugins, files: [file, ...others, ...added], artifacts: new Map(), meta, index: ctx.index };
  await runStages(plugins, compiling, CONTENT_STAGES);

  // The version compiles with the build's own steps, which the build's notes, embed targets included, decided:
  // math a version only embeds is registered by its target, never by the version's text. The stages that register
  // steps (GFM, syntax, LaTeX, diagrams) just ran again on the version, into this context's own collection; of those,
  // only steps the build lacks join, so none is applied twice.
  const build = getCompilerContributions(ctx);
  const own = getCompilerContributions(compiling);
  compiling.compiler = {
    ...own,
    remarkPlugins: [...build.remarkPlugins, ...missing(own.remarkPlugins, build.remarkPlugins)],
    rehypePlugins: [...build.rehypePlugins, ...missing(own.rehypePlugins, build.rehypePlugins)],
    svxSourceTransforms: [...build.svxSourceTransforms, ...missing(own.svxSourceTransforms, build.svxSourceTransforms)],
  };

  const tree = await renderMarkdownTree(compiling, file.content);
  // A relative URL, read from the note's own page, as the page shows it: led by `prefix` when it names something the
  // site publishes or an attachment the caller publishes at its usual path, sent to where the caller moved an
  // attachment, and `undefined` when it names nothing.
  const mount = ctx.config.mountPath ?? "";
  const moved = new Map([...options.moved ?? []].map(([path, url]) => [`${mount}/${path.replaceAll("\\", "/")}`, url]));
  const mine = new Set(added.map(({ path }) => `${mount}/${path.replaceAll("\\", "/")}`));
  /** `url`'s path, decoded, read from the note's own page; `undefined` for a malformed escape. */
  const resolve = (url: string) => {
    const { pathname, search, hash } = new URL(url, `https://svartz.invalid${note.href}`);
    try {
      return { decoded: decodeURIComponent(pathname), search, hash };
    } catch {
      return undefined;
    }
  };
  const shown = (url: string): string | undefined => {
    // A root-relative URL names the same file as a relative one, so it follows the file where the caller moved it.
    if (ROOT_RELATIVE.test(url)) {
      const at = resolve(url);
      const elsewhere = at && moved.get(at.decoded);
      return elsewhere ? `${elsewhere}${at.search}${at.hash}` : url;
    }
    if (ANCHORED.test(url)) return url;
    const at = resolve(url);
    if (!at) return undefined;
    const elsewhere = moved.get(at.decoded);
    if (elsewhere) return `${elsewhere}${at.search}${at.hash}`;
    return mine.has(at.decoded) || options.published(at.decoded) || options.published(`${at.decoded}/`) ? `${options.prefix}${url}` : undefined;
  };
  visit(tree, "element", (node: Element, index, parent) => {
    const href = node.properties.href;
    const src = node.properties.src;
    const dead = (typeof href === "string" && href && !shown(href)) || (typeof src === "string" && src && !shown(src));
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
      if (typeof value === "string" && value) node.properties[name] = shown(value);
    }
    const srcset = node.properties.srcSet;
    if (typeof srcset === "string" && srcset) {
      node.properties.srcSet = srcset.split(/,\s+/).flatMap((candidate) => {
        const [url = "", ...descriptor] = candidate.trim().split(/\s+/);
        const at = shown(url);
        return at ? [[at, ...descriptor].join(" ")] : [];
      }).join(", ");
    }
  });

  const resources = getCompilerContributions(ctx).browserResources;
  for (const [id, resource] of getCompilerContributions(compiling).browserResources) {
    if (!resources.has(id)) resources.set(id, resource);
  }
  return { markup: compileContent(tree), attachments: added.map(({ path }) => path) };
}

/** Generate adapter-independent discovery files from the published vault index. */
import { posix, resolve } from "node:path";
import { definePlugin, type Artifact, type Index, type IndexEntry, type PluginContext } from "@svartz/core";
import { compareExplorerNodes, orderOf, type ExplorerSortable } from "./explorer";
import { agentMarkdown, rebaseLinks, selfContained } from "./internal/agent-markdown";
import { createAssetResolver } from "./internal/asset-references";
import { renderMarkdown } from "./internal/render-markdown";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { alternateNames, markdownHref } from "./internal/routes";

const NOTE_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

const xml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

/** `site.url` includes the app's deployment base; entry hrefs include vault mounts. */
const absoluteUrl = (base: string, href: string): string =>
  new URL(href.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).href;

function addAsset(ctx: PluginContext, name: string, contents: string, mimeType = "application/xml"): void {
  const publicAssets = ctx.meta.get("svartz:publicAssetPaths") as ReadonlySet<string> | undefined;
  // A note's own path (`a.md`) is not a public asset, so its Markdown copy never conflicts with it.
  if (ctx.files.some((file) => file.path === name && !NOTE_EXTENSIONS.has(file.extension ?? "") && (!publicAssets || publicAssets.has(name)))) {
    throw new Error(`Published vault asset "${name}" conflicts with a generated Svartz discovery file.`);
  }
  const key = `assets/${name}`;
  const artifact: Artifact = {
    key,
    path: resolve(ctx.config.outDir, "..", "artifacts", key),
    type: "asset",
    pluginId: EMIT_DISCOVERY_ID,
    contents,
    mimeType,
  };
  ctx.artifacts.set(key, artifact);
}

/** Absolute with `site.url`; otherwise relative to the generated file, so any deployment base works. */
function linkFrom(base: string | undefined, fromHref: string) {
  return (href: string): string => {
    if (base) return absoluteUrl(base, href);
    const relative = posix.relative(posix.dirname(fromHref), href);
    return href.endsWith("/") ? `${relative || "."}/` : relative;
  };
}

interface ExplorerNode extends ExplorerSortable {
  /** A folder's slug; notes have none. */
  readonly folder?: string;
  /** The note, or a folder's folder note. */
  readonly entry?: IndexEntry;
}

/**
 * Every page in reading order, grouped by top-level folder: the home page, then the explorer top to bottom, each
 * folder's own note ahead of what it holds. Sections keep the order of their first page, and root pages share one.
 */
function readingSections(index: Index): { readonly title?: string; readonly entries: readonly IndexEntry[] }[] {
  const bySlug = new Map(index.entries.map((entry) => [entry.slug, entry]));
  // Every ancestor lists a note too; the longest slug is the folder its file sits in.
  const homes = new Map<string, string>();
  for (const folder of index.folders) {
    for (const slug of folder.noteSlugs) if (folder.slug.length > (homes.get(slug)?.length ?? -1)) homes.set(slug, folder.slug);
  }
  const folderNotes = new Set(index.folders.map((folder) => folder.noteSlug));
  const parentOf = (slug: string) => (slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : undefined);
  // Each folder's children, keyed by its slug; the vault root's are under `undefined`.
  const children = new Map<string | undefined, ExplorerNode[]>();
  const place = (folder: string | undefined, node: ExplorerNode) => {
    const siblings = children.get(folder);
    if (siblings) siblings.push(node);
    else children.set(folder, [node]);
  };
  for (const folder of index.folders) {
    const entry = folder.noteSlug === undefined ? undefined : bySlug.get(folder.noteSlug);
    place(parentOf(folder.slug), { isFolder: true, title: folder.title, order: orderOf(entry), folder: folder.slug, entry });
  }
  for (const entry of index.entries) {
    if (entry.slug === "index" || folderNotes.has(entry.slug)) continue;
    place(homes.get(entry.slug), { isFolder: false, title: entry.title, order: orderOf(entry), entry });
  }
  for (const nodes of children.values()) nodes.sort(compareExplorerNodes);
  const childrenOf = (folder: string | undefined) => children.get(folder) ?? [];
  const pages = (node: ExplorerNode): IndexEntry[] => [
    ...(node.entry ? [node.entry] : []),
    ...(node.folder === undefined ? [] : childrenOf(node.folder).flatMap(pages)),
  ];

  const home = bySlug.get("index");
  const sections = new Map<string, { title?: string; entries: IndexEntry[] }>(home ? [["", { entries: [home] }]] : []);
  for (const node of childrenOf(undefined)) {
    const key = node.folder ?? "";
    const section = sections.get(key) ?? { title: node.folder === undefined ? undefined : node.title, entries: [] };
    section.entries.push(...pages(node));
    sections.set(key, section);
  }
  return [...sections.values()];
}

/** `llms-full.txt` starts each page at its own heading; the line after it names the page it came from. */
function withSource(markdown: string, source: string): string {
  const [heading, ...body] = markdown.trimEnd().split("\n");
  return [heading, "", `Source: ${source}`, ...body].join("\n");
}

/** The low-value listing pages agents can skip: tag pages, folder listings and the feed. */
function optionalPages(index: Index): { readonly title: string; readonly href: string; readonly description: string }[] {
  const { routes, tags, folders } = index;
  const tagPages = tags.filter((tag) => routes.tags.includes(tag.href));
  const folderPages = folders.filter((folder) => routes.folders.includes(folder.href));
  // A folder's own URL (`/guides/`) shows its folder note, or the same listing as its folder page.
  const named = new Set([...tags, ...folders].map((page) => page.href));
  const natural = new Set(folders.map((folder) => `${routes.mountPath}/${folder.slug}/`));
  return [
    ...routes.tags.filter((href) => !named.has(href)).map((href) => ({ title: "Tags", href, description: "Every tag." })),
    ...tagPages.map((tag) => ({ title: `#${tag.title}`, href: tag.href, description: `Pages tagged ${tag.title}.` })),
    ...routes.folders.filter((href) => !named.has(href) && !natural.has(href))
      .map((href) => ({ title: "Folders", href, description: "Every folder." })),
    ...folderPages.map((folder) => ({ title: folder.title, href: folder.href, description: `Pages in the ${folder.title} folder.` })),
    ...routes.feed.map((href) => ({ title: "Feed", href, description: "The latest pages." })),
  ];
}

/** Markdown copies of public notes, the vault's `llms.txt` index, and every copy in one `llms-full.txt`. */
function emitLlms(ctx: PluginContext, base: string | undefined): void {
  const index = ctx.index!;
  const entries = index.entries;
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const sources = (ctx.meta.get("sourceBodies") as ReadonlyMap<string, string> | undefined) ?? new Map<string, string>();
  const notes = ctx.files.filter((file) => NOTE_EXTENSIONS.has(file.extension ?? ""));
  const slugMap = buildSlugMap(notes.map((file) => ({
    slug: file.slug,
    path: file.path,
    aliases: alternateNames(file.frontmatter, ctx.config.frontmatter.aliasesField),
  })));
  const allSlugs = notes.map((file) => file.slug);
  const publicAssets = ctx.meta.get("svartz:publicAssetPaths") as ReadonlySet<string> | undefined;
  const resolveAsset = createAssetResolver(ctx.files.filter((file) =>
    !NOTE_EXTENSIONS.has(file.extension ?? "") && (!publicAssets || publicAssets.has(file.path))));
  const mountPath = ctx.config.mountPath ?? "";
  const notesBySlug = new Map(notes.map((file) => [file.slug, file]));

  /** A page's Markdown copy as it sits at `copyHref`; the one in `llms-full.txt` drops the frontmatter. */
  const copyOf = (entry: IndexEntry, copyHref: string, withProperties: boolean): string | undefined => {
    const file = notesBySlug.get(entry.slug);
    const source = file && sources.get(file.path);
    if (!file || source === undefined) return undefined;
    const url = linkFrom(base, copyHref);
    return agentMarkdown(file, source, { title: entry.title, properties: withProperties ? file.frontmatter ?? {} : {} }, {
      note(link) {
        const slug = resolveLink({ raw: "", label: undefined, ...link }, slugMap, allSlugs, ctx.config.linkResolution, file.slug, notes);
        const target = slug ? bySlug.get(slug) : undefined;
        return target && url(target.markdownHref ?? target.href);
      },
      asset(target) {
        const path = resolveAsset(file, target);
        return path && url(`${mountPath}/${path.split("/").map(encodeURIComponent).join("/")}`);
      },
    });
  };

  for (const entry of entries) {
    const markdown = entry.markdownHref && copyOf(entry, entry.markdownHref, true);
    if (markdown) addAsset(ctx, entry.markdownHref!.slice(mountPath.length + 1), markdown, "text/markdown");
  }

  const reading = readingSections(index);
  const sections = reading
    .map((section) => ({ ...section, entries: section.entries.filter((entry) => entry.markdownHref) }))
    .filter((section) => section.entries.length > 0);
  const { title, description } = ctx.config.site;
  const intro = [`# ${title}`, "", ...(description ? [`> ${description}`, ""] : [])];
  const reserved = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set();

  if (!reserved.has("llms.txt")) {
    const url = linkFrom(base, `${mountPath}/llms.txt`);
    const item = (name: string, href: string, summary: string | undefined) =>
      `- [${name}](${url(href)})${summary ? `: ${summary.replace(/\n/g, " ")}` : ""}`;
    const optional = ctx.config.discovery.llms.optional ? optionalPages(index) : [];
    addAsset(ctx, "llms.txt", [
      ...intro,
      `Each page links to a Markdown copy of its content. [llms-full.txt](${url(`${mountPath}/llms-full.txt`)}) holds every page in one file.`,
      "",
      ...sections.flatMap((section) => [
        // `## Optional` is the opt-in section agents may skip, so a folder with that name says it is one.
        `## ${section.title === undefined ? "Pages" : /^optional$/i.test(section.title.trim()) ? `${section.title} (folder)` : section.title}`,
        "",
        ...section.entries.map((entry) => item(entry.title, entry.markdownHref!, entry.description)),
        "",
      ]),
      ...(optional.length > 0
        ? ["## Optional", "", ...optional.map((page) => item(page.title, page.href, page.description)), ""]
        : []),
    ].join("\n"), "text/plain");
  }

  if (!reserved.has("llms-full.txt")) {
    // A page's own location is gone here, so each link is resolved from where the page's copy is deployed and kept
    // absolute, or root-relative without `site.url`: it reaches exactly what it reaches from the copy.
    const deploymentBase = (ctx.meta.get("svartz:deploymentBase") as string | undefined) ?? "";
    const deployed = (href: string) => (base ? new URL(absoluteUrl(base, href)) : new URL(`${deploymentBase}${href}`, "https://svartz.invalid"));
    const format = (url: URL) => (base ? url.href : `${url.pathname}${url.search}${url.hash}`);
    // A host route may own a page's `.md` URL; the page is still public, so its content belongs here.
    const pages = reading.flatMap((section) => section.entries)
      .filter((entry) => !entry.locked && !entry.properties.encrypted && !entry.properties.hidden)
      .flatMap((entry) => {
        const copyHref = entry.markdownHref ?? markdownHref(entry.slug, mountPath);
        const markdown = copyOf(entry, copyHref, false);
        if (!markdown) return [];
        const rebased = rebaseLinks(markdown, deployed(copyHref), format);
        return [withSource(selfContained(rebased, entry.slug), format(deployed(entry.href))), ""];
      });
    addAsset(ctx, "llms-full.txt", [...intro, ...pages].join("\n"), "text/plain");
  }
}

function sortedEntries(ctx: PluginContext): IndexEntry[] {
  const sort = ctx.config.discovery.feed.sort;
  const sources = new Map(ctx.files.map((file) => [file.path, file]));
  return [...(ctx.index?.entries ?? [])]
    .filter((entry) => !entry.locked && !entry.properties.encrypted && !entry.properties.hidden && sources.get(entry.path)?.extension !== ".svx")
    .sort((left, right) => {
      const leftDate = sort === "modified" ? left.modifiedAt : left.publishedAt ?? left.createdAt;
      const rightDate = sort === "modified" ? right.modifiedAt : right.publishedAt ?? right.createdAt;
      return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0) || left.href.localeCompare(right.href);
    });
}

async function rss(ctx: PluginContext, base: string): Promise<string> {
  const { site, discovery } = ctx.config;
  const entries = sortedEntries(ctx).slice(0, discovery.feed.limit);
  const items = await Promise.all(entries.map(async (entry) => {
    const link = absoluteUrl(base, entry.href);
    const date = discovery.feed.sort === "modified"
      ? entry.modifiedAt : entry.publishedAt ?? entry.createdAt;
    const description = xml(entry.description ?? "");
    const file = ctx.files.find((candidate) => candidate.path === entry.path);
    const fullHtml = discovery.feed.content === "full" && file?.extension !== ".svx" && file
      ? await renderMarkdown(ctx, file.content, link) : undefined;
    return [
      "<item>",
      `<title>${xml(entry.title)}</title>`,
      `<link>${xml(link)}</link>`,
      `<guid isPermaLink="true">${xml(link)}</guid>`,
      ...(date ? [`<pubDate>${date.toUTCString()}</pubDate>`] : []),
      `<description>${description}</description>`,
      ...(fullHtml ? [`<content:encoded><![CDATA[${fullHtml.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>`] : []),
      "</item>",
    ].join("");
  }));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>',
    `<title>${xml(site.title)}</title>`,
    `<link>${xml(base)}</link>`,
    `<description>${xml(site.description ?? site.title)}</description>`,
    ...items,
    "</channel></rss>",
  ].join("\n");
}

function sitemap(ctx: PluginContext, base: string): string {
  const index = ctx.index;
  const entries = index?.entries ?? [];
  const pages = new Map<string, Date | undefined>(entries
    .filter((entry) => !entry.properties.encrypted && !entry.properties.hidden)
    .map((entry) => [entry.href, entry.modifiedAt]));
  const home = `${index?.routes.mountPath ?? ""}/`;
  if (index?.routes.all.includes(home) && !pages.has(home)) pages.set(home, undefined);
  for (const href of [...(index?.routes.tags ?? []), ...(index?.routes.folders ?? []), ...(index?.routes.feed ?? []), ...(index?.routes.theme ?? [])]) {
    if (!pages.has(href)) pages.set(href, undefined);
  }
  const urls = [...pages].sort(([left], [right]) => left.localeCompare(right)).map(([href, modified]) =>
    `<url><loc>${xml(absoluteUrl(base, href))}</loc>${modified ? `<lastmod>${modified.toISOString()}</lastmod>` : ""}</url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

/** Search engines plus the AI search and agent fetchers that cite pages in answers. */
const SEARCH_CRAWLERS = [
  "Googlebot", "bingbot", "DuckDuckBot", "Applebot",
  "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
];

/** Crawlers, and robots.txt tokens such as Google-Extended, that collect pages to train AI models. */
const TRAINING_CRAWLERS = [
  "GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Meta-ExternalAgent", "Bytespider",
];

const group = (agents: readonly string[], lines: readonly string[]): string =>
  [...agents.map((agent) => `User-agent: ${agent}`), ...lines].join("\n");

/**
 * An empty `Disallow:` admits everything without a rule of its own. A raw rule for the same agents merges into the
 * group, and Google prefers `Allow: /` over an equally long `Disallow: /`, so `Allow: /` would cancel a raw block.
 */
const crawl = (allowed: boolean): string => allowed ? "Disallow:" : "Disallow: /";

/** Crawlers fetch robots.txt only at the origin root: `/robots.txt`, below any mount or deployment base. */
function atOriginRoot(ctx: PluginContext, base: string | undefined): boolean {
  const deploymentBase = (ctx.meta.get("svartz:deploymentBase") as string | undefined) ?? "";
  const publicPath = base ? new URL(base).pathname.replace(/\/+$/, "") : "";
  return !ctx.config.mountPath && !deploymentBase && !publicPath;
}

function robots(ctx: PluginContext, base: string | undefined): string {
  const { robots: config, sitemap: sitemapConfig } = ctx.config.discovery;
  const { search, aiInput, aiTrain } = config.contentSignals;
  const signals = Object.entries({ search, "ai-input": aiInput, "ai-train": aiTrain })
    .flatMap(([name, value]) => value === undefined ? [] : [`${name}=${value ? "yes" : "no"}`]);
  // A crawler obeys only its most specific group, so a preset that matches `*` needs no group of its own, and every
  // group repeats the content signals: a crawler with its own group never reads `*`'s.
  const signal = signals.length ? [`Content-Signal: ${signals.join(", ")}`] : [];
  // The preset that covers a crawler, and so the line its own rule starts from. Crawlers match case-insensitively on a
  // token's leading letters, `-` and `_` (RFC 9309), so `Googlebot.1` is Googlebot.
  const presetOf = (agent: string) => {
    const name = /^[A-Za-z_-]*/.exec(agent)![0].toLowerCase();
    if (SEARCH_CRAWLERS.some((crawler) => crawler.toLowerCase() === name)) return config.search;
    if (TRAINING_CRAWLERS.some((crawler) => crawler.toLowerCase() === name)) return config.training;
    return config.bots;
  };
  return [
    group(["*"], [...signal, crawl(config.bots)]),
    ...config.search === config.bots ? [] : [group(SEARCH_CRAWLERS, [...signal, crawl(config.search)])],
    ...config.training === config.bots ? [] : [group(TRAINING_CRAWLERS, [...signal, crawl(config.training)])],
    // A crawler a rule names reads only that rule's group, so the group repeats its preset's line: a rule narrows the
    // preset instead of replacing it. Its agents split by preset, since a blocked and an admitted one need different lines.
    ...config.rules.flatMap((rule) => [true, false].flatMap((admitted) => {
      const agents = [rule.userAgent].flat().filter((agent) => presetOf(agent) === admitted);
      return agents.length ? [group(agents, [
        ...signal,
        crawl(admitted),
        ...(rule.allow ?? []).map((path) => `Allow: ${path}`),
        ...(rule.disallow ?? []).map((path) => `Disallow: ${path}`),
      ])] : [];
    })),
    ...sitemapConfig.enabled && base ? [`Sitemap: ${absoluteUrl(base, "/sitemap.xml")}`] : [],
  ].join("\n\n") + "\n";
}

export const EMIT_DISCOVERY_ID = "core:emit-discovery" as const;

export const emitDiscovery = definePlugin(() => ({
  id: EMIT_DISCOVERY_ID,
  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;
      const { feed, sitemap: sitemapConfig, llms, robots: robotsConfig } = ctx.config.discovery;
      const base = ctx.config.site.url;
      if (llms?.enabled) emitLlms(ctx, base);
      const reserved = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set();
      if (robotsConfig?.enabled && atOriginRoot(ctx, base) && !reserved.has("robots.txt")) {
        addAsset(ctx, "robots.txt", robots(ctx, base), "text/plain");
      }
      if (!feed.enabled && !sitemapConfig.enabled) return;
      if (!base) {
        if (ctx.meta.get("svartz:mode") === "development") return;
        throw new Error(`Vault "${ctx.config.id}" needs site.url to generate RSS or sitemap in production.`);
      }
      if (feed.enabled && !reserved.has("rss.xml")) addAsset(ctx, "rss.xml", await rss(ctx, base));
      if (sitemapConfig.enabled && !reserved.has("sitemap.xml")) addAsset(ctx, "sitemap.xml", sitemap(ctx, base));
    },
    options: { fatal: true },
  },
}));

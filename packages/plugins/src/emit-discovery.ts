/** Generate adapter-independent discovery files from the published vault index. */
import { posix, resolve } from "node:path";
import { definePlugin, type Artifact, type IndexEntry, type PluginContext } from "@svartz/core";
import { agentMarkdown } from "./internal/agent-markdown";
import { createAssetResolver } from "./internal/asset-references";
import { renderMarkdown } from "./internal/render-markdown";
import { buildSlugMap, resolveLink } from "./internal/resolve";
import { alternateNames } from "./internal/routes";

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

/** Markdown copies of public notes plus the vault's `llms.txt` index. */
function emitLlms(ctx: PluginContext, base: string | undefined): void {
  const entries = ctx.index?.entries ?? [];
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
  const published = entries.filter((entry): entry is IndexEntry & { markdownHref: string } => Boolean(entry.markdownHref));

  const notesBySlug = new Map(notes.map((file) => [file.slug, file]));
  for (const entry of published) {
    const file = notesBySlug.get(entry.slug);
    const source = file && sources.get(file.path);
    if (!file || source === undefined) continue;
    const url = linkFrom(base, entry.markdownHref);
    const markdown = agentMarkdown(file, source, entry, {
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
    addAsset(ctx, entry.markdownHref.slice(mountPath.length + 1), markdown, "text/markdown");
  }

  const reserved = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set();
  if (reserved.has("llms.txt")) return;
  const url = linkFrom(base, `${mountPath}/llms.txt`);
  const { title, description } = ctx.config.site;
  const pages = [...published]
    .sort((left, right) => left.href.localeCompare(right.href))
    .map((entry) => `- [${entry.title}](${url(entry.markdownHref)})${entry.description ? `: ${entry.description.replace(/\n/g, " ")}` : ""}`);
  addAsset(ctx, "llms.txt", [
    `# ${title}`,
    "",
    ...(description ? [`> ${description}`, ""] : []),
    "Each page links to a Markdown copy of its content.",
    "",
    "## Pages",
    "",
    ...pages,
    "",
  ].join("\n"), "text/plain");
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

export const EMIT_DISCOVERY_ID = "core:emit-discovery" as const;

export const emitDiscovery = definePlugin(() => ({
  id: EMIT_DISCOVERY_ID,
  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;
      const { feed, sitemap: sitemapConfig, llms } = ctx.config.discovery;
      const base = ctx.config.site.url;
      if (llms?.enabled) emitLlms(ctx, base);
      if (!feed.enabled && !sitemapConfig.enabled) return;
      if (!base) {
        if (ctx.meta.get("svartz:mode") === "development") return;
        throw new Error(`Vault "${ctx.config.id}" needs site.url to generate RSS or sitemap in production.`);
      }
      const reserved = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set();
      if (feed.enabled && !reserved.has("rss.xml")) addAsset(ctx, "rss.xml", await rss(ctx, base));
      if (sitemapConfig.enabled && !reserved.has("sitemap.xml")) addAsset(ctx, "sitemap.xml", sitemap(ctx, base));
    },
    options: { fatal: true },
  },
}));

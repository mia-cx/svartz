/** Generate adapter-independent discovery files from the published vault index. */
import { resolve } from "node:path";
import { definePlugin, type Artifact, type IndexEntry, type PluginContext } from "@svartz/core";
import { renderMarkdown } from "./internal/render-markdown";

const xml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

/** `site.url` includes the app's deployment base; entry hrefs include vault mounts. */
const absoluteUrl = (base: string, href: string): string =>
  new URL(href.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).href;

function addAsset(ctx: PluginContext, name: string, contents: string): void {
  const key = `assets/${name}`;
  const artifact: Artifact = {
    key,
    path: resolve(ctx.config.outDir, "..", "artifacts", key),
    type: "asset",
    pluginId: EMIT_DISCOVERY_ID,
    contents,
    mimeType: "application/xml",
  };
  ctx.artifacts.set(key, artifact);
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
      ? await renderMarkdown(ctx, file.content) : undefined;
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
  if (index?.routes.all.includes(home)) pages.set(home, undefined);
  for (const href of [...(index?.routes.tags ?? []), ...(index?.routes.folders ?? []), ...(index?.routes.feed ?? [])]) {
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
      const { feed, sitemap: sitemapConfig } = ctx.config.discovery;
      if (!feed.enabled && !sitemapConfig.enabled) return;
      const base = ctx.config.site.url;
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

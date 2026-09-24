import type { Index, ResolvedSiteConfig } from "@svartz/core";

/** Published vault data used by an opt-in host feed or sitemap. */
export interface HostDiscoveryVault {
  readonly id: string;
  readonly artifacts: {
    readonly index: Index;
    readonly siteConfig: ResolvedSiteConfig;
  };
}

export interface HostFeedOptions {
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  readonly limit?: number;
  readonly sort?: "published" | "modified";
}

const xml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function selectVaults(vaults: readonly HostDiscoveryVault[], ids: readonly string[]): HostDiscoveryVault[] {
  if (ids.length === 0) throw new Error("Select at least one vault for host discovery output.");
  const byId = new Map(vaults.map((vault) => [vault.id, vault]));
  return [...new Set(ids)].map((id) => {
    const vault = byId.get(id);
    if (!vault) throw new Error(`Unknown host discovery vault "${id}".`);
    if (!vault.artifacts.siteConfig.url) throw new Error(`Vault "${id}" needs site.url for host discovery output.`);
    return vault;
  });
}

function noteUrl(vault: HostDiscoveryVault, href: string): string {
  const base = vault.artifacts.siteConfig.url!;
  return new URL(href.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).href;
}

/** Render a summary RSS feed for an explicit set of host vaults. */
export function renderHostRss(
  vaults: readonly HostDiscoveryVault[],
  selectedIds: readonly string[],
  options: HostFeedOptions,
): string {
  if (!Number.isInteger(options.limit ?? 10) || (options.limit ?? 10) < 1) {
    throw new Error("Host feed limit must be a positive integer.");
  }
  const selected = selectVaults(vaults, selectedIds);
  const entries = selected.flatMap((vault) => vault.artifacts.index.entries
    .filter((entry) => !entry.locked && !entry.properties.encrypted && !entry.properties.hidden && !entry.path.toLowerCase().endsWith(".svx"))
    .map((entry) => ({ entry, url: noteUrl(vault, entry.href) })));
  const date = (item: typeof entries[number]): Date | undefined => options.sort === "modified"
    ? item.entry.modifiedAt : item.entry.publishedAt ?? item.entry.createdAt;
  entries.sort((left, right) => (date(right)?.getTime() ?? 0) - (date(left)?.getTime() ?? 0) || left.url.localeCompare(right.url));
  const items = entries.slice(0, options.limit ?? 10).map(({ entry, url }) => {
    const entryDate = date({ entry, url });
    return [
      "<item>",
      `<title>${xml(entry.title)}</title>`,
      `<link>${xml(url)}</link>`,
      `<guid isPermaLink="true">${xml(url)}</guid>`,
      ...(entryDate ? [`<pubDate>${entryDate.toUTCString()}</pubDate>`] : []),
      `<description>${xml(entry.description ?? "")}</description>`,
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${xml(options.title)}</title>`,
    `<link>${xml(options.url)}</link>`,
    `<description>${xml(options.description ?? options.title)}</description>`,
    ...items,
    "</channel></rss>",
  ].join("\n");
}

/** Render a sitemap for selected mounts on the same public host. */
export function renderHostSitemap(
  vaults: readonly HostDiscoveryVault[],
  selectedIds: readonly string[],
): string {
  const selected = selectVaults(vaults, selectedIds);
  const origins = new Set(selected.map((vault) => new URL(vault.artifacts.siteConfig.url!).origin));
  if (origins.size !== 1) throw new Error("Combined sitemap vaults must share one public host.");
  const pages = new Map<string, Date | undefined>();
  for (const vault of selected) {
    const { index } = vault.artifacts;
    for (const entry of index.entries) {
      if (!entry.properties.encrypted && !entry.properties.hidden) pages.set(noteUrl(vault, entry.href), entry.modifiedAt);
    }
    const home = `${index.routes.mountPath}/`;
    const homeUrl = noteUrl(vault, home);
    if (index.routes.all.includes(home) && !pages.has(homeUrl)) pages.set(homeUrl, undefined);
    for (const href of [...index.routes.tags, ...index.routes.folders, ...index.routes.feed]) {
      const url = noteUrl(vault, href);
      if (!pages.has(url)) pages.set(url, undefined);
    }
  }
  const urls = [...pages].sort(([left], [right]) => left.localeCompare(right)).map(([url, modified]) =>
    `<url><loc>${xml(url)}</loc>${modified ? `<lastmod>${modified.toISOString()}</lastmod>` : ""}</url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

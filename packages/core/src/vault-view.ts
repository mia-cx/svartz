import type { Index, IndexEntry, RouteIndex, SearchDocument } from "./types";

export interface VaultNoteView {
  readonly entry: IndexEntry;
  readonly outgoing: readonly IndexEntry[];
  readonly backlinks: readonly IndexEntry[];
}

/** Published, vault-scoped data for SvelteKit loaders and theme components. */
export interface VaultView {
  readonly id: string;
  readonly entries: readonly IndexEntry[];
  readonly search: readonly SearchDocument[];
  readonly graph: Index["graph"];
  readonly backlinks: Index["backlinks"];
  readonly tags: Index["tags"];
  readonly folders: Index["folders"];
  readonly routes: RouteIndex;
  readonly assets: Index["assets"];
  /** Find a published note by slug, href, or encoded SvelteKit URL pathname. */
  note(reference: string): VaultNoteView | undefined;
}

/** Apply the deployment base to one published entry, including a newly unlocked hidden note. */
export function createVaultEntryView(entry: IndexEntry, basePath = ""): IndexEntry {
  const withBase = (href: string) => `${basePath}${href}`;
  return {
    ...entry,
    href: withBase(entry.href),
    socialImage: entry.socialImage?.startsWith("/") ? withBase(entry.socialImage) : entry.socialImage,
    links: entry.links.map((link) => ({
      ...link,
      href: link.href?.startsWith("/") ? withBase(link.href) : link.href,
    })),
  };
}

/** Compose SvelteKit's deployment base with the index's vault-mounted URLs once. */
export function createVaultView(index: Index, id: string, basePath = ""): VaultView {
  const withBase = (href: string) => `${basePath}${href}`;
  const entries = index.entries.map((entry) => createVaultEntryView(entry, basePath));
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const byHref = new Map(entries.map((entry) => [entry.href, entry]));
  const search = index.search.map((document) => ({ ...document, href: withBase(document.href) }));
  const routes: RouteIndex = {
    mountPath: withBase(index.routes.mountPath || "/").replace(/\/$/, ""),
    notes: index.routes.notes.map(withBase),
    redirects: Object.fromEntries(Object.entries(index.routes.redirects)
      .map(([from, to]) => [withBase(from), withBase(to)])),
    tags: index.routes.tags.map(withBase),
    folders: index.routes.folders.map(withBase),
    feed: index.routes.feed.map(withBase),
    all: index.routes.all.map(withBase),
  };

  return {
    id,
    entries,
    search,
    graph: index.graph,
    backlinks: index.backlinks,
    tags: index.tags.map((tag) => ({ ...tag, href: withBase(tag.href) })),
    folders: index.folders.map((folder) => ({ ...folder, href: withBase(folder.href) })),
    routes,
    assets: index.assets,
    note(reference) {
      const normalized = reference.endsWith("/") || !reference.startsWith("/")
        ? reference
        : `${reference}/`;
      let entry = bySlug.get(reference) ?? byHref.get(normalized);
      if (!entry) {
        try {
          entry = byHref.get(decodeURI(normalized));
        } catch {
          return undefined;
        }
      }
      if (!entry) return undefined;
      return {
        entry,
        outgoing: (index.graph[entry.slug] ?? []).flatMap((slug) => bySlug.get(slug) ?? []),
        backlinks: (index.backlinks[entry.slug] ?? []).flatMap((slug) => bySlug.get(slug) ?? []),
      };
    },
  };
}

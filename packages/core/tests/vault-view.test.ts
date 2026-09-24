import { describe, expect, it } from "vitest";
import type { Index, IndexEntry } from "../src/types";
import { createVaultEntryView, createVaultView } from "../src/vault-view";

const date = new Date("2026-01-01T00:00:00.000Z");
const entry = (slug: string): IndexEntry => ({
  slug,
  href: `/blog/${slug}/`,
  path: `${slug}.md`,
  properties: { title: slug },
  page: { toc: true, comments: true },
  title: slug,
  tags: [],
  aliases: [],
  content: `${slug} content`,
  links: slug === "hello" ? [{ raw: "[[world]]", href: "/blog/world/" }, { raw: "[[missing]]", href: null }] : [],
  toc: [],
  wordCount: 2,
  readingTimeMinutes: 1,
  createdAt: date,
  modifiedAt: date,
});

const index: Index = {
  version: "1.0.0",
  entries: [{ ...entry("hello"), socialImage: "/blog/__svartz/social/hello.png" }, entry("world")],
  graph: { hello: ["world"], world: [] },
  backlinks: { hello: [], world: ["hello"] },
  search: [{ id: "hello", slug: "hello", href: "/blog/hello/", title: "hello", content: "hello content", tags: [], aliases: [] }],
  tags: [{ slug: "news", title: "News", noteCount: 1, href: "/blog/tags/news/" }],
  folders: [],
  routes: {
    mountPath: "/blog",
    notes: ["/blog/hello/", "/blog/world/"],
    redirects: { "/blog/hi/": "/blog/hello/" },
    tags: ["/blog/tags/"],
    folders: [],
    feed: [],
    theme: [],
    all: ["/blog/hello/", "/blog/world/", "/blog/hi/", "/blog/tags/"],
  },
  assets: [],
};

describe("vault view", () => {
  it("base-prefixes an unlocked hidden entry that was absent from public navigation", () => {
    const hidden = { ...entry("hidden"), socialImage: "/blog/private.png" };
    expect(createVaultEntryView(hidden, "/site")).toMatchObject({
      href: "/site/blog/hidden/",
      socialImage: "/site/blog/private.png",
      links: [],
    });
  });
  it("serves one published index with deployment base composed once", () => {
    const vault = createVaultView(index, "journal", "/site");
    expect(vault.id).toBe("journal");
    expect(vault.note("hello")?.entry.href).toBe("/site/blog/hello/");
    expect(vault.note("hello")?.entry.socialImage).toBe("/site/blog/__svartz/social/hello.png");
    expect(vault.note("hello")?.entry.links.map((link) => link.href)).toEqual(["/site/blog/world/", null]);
    expect(vault.note("/site/blog/hello")?.outgoing.map((note) => note.slug)).toEqual(["world"]);
    expect(vault.note("/site/blog/world/")?.backlinks.map((note) => note.slug)).toEqual(["hello"]);
    expect(vault.note("/site/blog/missing")).toBeUndefined();
    expect(vault.search[0]?.href).toBe("/site/blog/hello/");
    expect(vault.tags[0]?.href).toBe("/site/blog/tags/news/");
    expect(vault.routes.redirects).toEqual({ "/site/blog/hi/": "/site/blog/hello/" });
    expect(index.entries[0]?.href).toBe("/blog/hello/");
  });

  it("accepts a replacement index built before theme routes were added", () => {
    const { theme: _theme, ...routes } = index.routes;
    const vault = createVaultView({ ...index, routes }, "journal", "/site");
    expect(vault.routes.theme).toEqual([]);
    expect(vault.routes.notes).toEqual(["/site/blog/hello/", "/site/blog/world/"]);
  });

  it("finds a Unicode note through an encoded SvelteKit URL pathname", () => {
    const unicode = entry("日本");
    const vault = createVaultView({ ...index, entries: [...index.entries, unicode] }, "journal", "/site");
    const pathname = new URL("https://example.test/site/blog/日本/").pathname;
    expect(vault.note(pathname)?.entry.slug).toBe("日本");
    expect(vault.note("/site/blog/%ZZ/")).toBeUndefined();
  });
});

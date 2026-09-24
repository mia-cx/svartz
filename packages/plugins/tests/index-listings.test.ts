import { expect, it } from "vitest";
import type { PluginContext, ResolvedConfig } from "@svartz/core";
import { indexContent } from "../src/index-content";
import { allocateRoutes } from "../src/internal/routes";

it("indexes ancestor folders and unique tags from published files", () => {
  const ctx = {
    config: {
      id: "blog", mountPath: "/blog", theme: { base: "minimal" },
      frontmatter: {
        titleField: "title", tagsField: "tags", aliasesField: "aliases",
        descriptionField: "description", createdAtField: "created_at",
        updatedAtField: "updated_at", publishedField: "published_at",
      },
      discovery: { dateSources: ["filesystem"] },
    } as ResolvedConfig,
    files: [
      { path: "Guides/index.md", slug: "guides", extension: ".md", content: "# Landing", frontmatter: { tags: ["docs", "docs"] }, inlineTags: ["docs", "topic/sub"] },
      { path: "Guides/Deep/one.md", slug: "guides/deep/one", extension: ".md", content: "# One", frontmatter: { tags: ["docs"] } },
      { path: "Guides/Deep/two.md", slug: "guides/deep/two", extension: ".md", content: "# Two" },
    ],
    meta: new Map([["reservedRoutes", new Set(["folders/guides/deep"])]]),
  } as unknown as PluginContext;

  indexContent().indexContent!.run(ctx);
  expect(ctx.index?.folders).toEqual([
    { slug: "guides", title: "Guides", noteCount: 3, noteSlugs: ["guides", "guides/deep/one", "guides/deep/two"], href: "/blog/folders/guides/" },
    { slug: "guides/deep", title: "Deep", noteCount: 2, noteSlugs: ["guides/deep/one", "guides/deep/two"], href: "/blog/folders/guides/deep/" },
  ]);
  expect(ctx.index?.tags).toEqual([
    { slug: "docs", title: "docs", noteCount: 2, href: "/blog/tags/docs/" },
    { slug: "topic/sub", title: "topic/sub", noteCount: 1, href: "/blog/tags/topic/sub/" },
  ]);
  expect(ctx.index?.routes.folders).toContain("/blog/folders/guides/");
  expect(ctx.index?.routes.folders).not.toContain("/blog/folders/guides/deep/");
  expect(ctx.index?.routes.notes).toContain("/blog/guides/");
});

it("lists physical folder members after canonical and host route collisions", () => {
  for (const reservedRoutes of [new Set<string>(), new Set(["guides"])]) {
    const files = [
      { path: "guides.md", slug: "guides", extension: ".md", content: "# Root guide" },
      { path: "Guides/index.md", slug: "guides", extension: ".md", content: "# Folder landing" },
      { path: "Guides/deep.md", slug: "guides/deep", extension: ".md", content: "# Deep guide" },
    ];
    allocateRoutes(files, reservedRoutes);
    const ctx = {
      config: {
        id: "blog", mountPath: "/blog", theme: { base: "minimal" },
        frontmatter: { titleField: "title", tagsField: "tags", aliasesField: "aliases", descriptionField: "description", createdAtField: "created_at", updatedAtField: "updated_at", publishedField: "published_at" },
        discovery: { dateSources: ["filesystem"] },
      } as ResolvedConfig,
      files,
      meta: new Map([["reservedRoutes", reservedRoutes]]),
    } as unknown as PluginContext;
    indexContent().indexContent!.run(ctx);

    const folder = ctx.index!.folders.find((item) => item.slug === "guides")!;
    const landingSlug = files.find((file) => file.path === "Guides/index.md")!.slug;
    const rootSlug = files.find((file) => file.path === "guides.md")!.slug;
    expect(folder.noteSlugs).toEqual([landingSlug, "guides/deep"].sort());
    expect(folder.noteSlugs).not.toContain(rootSlug);
    expect(folder.noteCount).toBe(2);
  }
});

it("deduplicates frontmatter and inline tags without splitting case variants", () => {
  const ctx = {
    config: {
      id: "blog", path: "/vault", outDir: "/out", mountPath: "/blog",
      theme: { base: "minimal" }, site: { title: "Blog" },
      frontmatter: { titleField: "title", descriptionField: "description", tagsField: "tags", aliasesField: "aliases", createdAtField: "created_at", updatedAtField: "updated_at", publishedField: "published_at" },
      discovery: { dateSources: ["filesystem"] },
    } as ResolvedConfig,
    files: [{ path: "note.md", slug: "note", extension: ".md", content: "#Topic", frontmatter: { tags: ["Topic"] }, inlineTags: ["topic"] }],
    meta: new Map(), artifacts: new Map(),
  } as PluginContext;
  indexContent().indexContent!.run(ctx);
  expect(ctx.index?.entries[0]?.tags).toEqual(["topic"]);
  expect(ctx.index?.tags).toContainEqual({ slug: "topic", title: "topic", noteCount: 1, href: "/blog/tags/topic/" });
});

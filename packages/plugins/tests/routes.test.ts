import { describe, expect, it } from "vitest";
import type { ProcessedFile, PluginContext } from "@svartz/core";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { resolveLinks } from "../src/resolve-links";
import { allocateRoutesPlugin } from "../src/allocate-routes";
import { indexContent } from "../src/index-content";
import { allocateRedirects, allocateRoutes } from "../src/internal/routes";
import { fileToSlug } from "../src/internal/slug";

const note = (path: string, content = ""): ProcessedFile => ({
  path,
  extension: path.slice(path.lastIndexOf(".")),
  slug: fileToSlug(path),
  content,
});

function context(files: ProcessedFile[]): PluginContext {
  return {
    config: {
      version: "1.0.0",
      id: "blog",
      path: "/vault",
      outDir: "/out",
      include: [],
      exclude: [],
      publicationMode: "exclusion",
      linkResolution: "closest",
      theme: { base: "minimal" },
      frontmatter: {
        titleField: "title",
        descriptionField: "description",
        tagsField: "tags",
        aliasesField: "aliases",
        createdAtField: "created_at",
        updatedAtField: "updated_at",
        publishedField: "published_at",
      },
      site: { title: "Blog" },
      mountPath: "/blog",
      target: { type: "host" },
      plugins: [],
    },
    files,
    artifacts: new Map(),
    meta: new Map(),
  };
}

describe("canonical route allocation", () => {
  it("reserves natural filenames before suffixing, regardless of discovery order", () => {
    const paths = ["hello world.md", "hello-world.md", "hello world 2.md", "hello-world-2.md"];
    const allocate = (ordered: string[]) => {
      const files = ordered.map((path) => note(path));
      allocateRoutes(files);
      return Object.fromEntries(files.map((file) => [file.path, file.slug]));
    };
    const expected = {
      "hello world.md": "hello-world-3",
      "hello-world.md": "hello-world",
      "hello world 2.md": "hello-world-2-2",
      "hello-world-2.md": "hello-world-2",
    };
    expect(allocate(paths)).toEqual(expected);
    expect(allocate([...paths].reverse())).toEqual(expected);
  });

  it("lets a manual host route claim its path", () => {
    const files = [note("about.md"), note("about-2.md")];
    allocateRoutes(files, new Set(["about"]));
    expect(files.map((file) => file.slug)).toEqual(["about-3", "about-2"]);
  });

  it("only gives unused paths to alias and permalink redirects", () => {
    const files = [note("hello.md"), note("other.md")];
    files[0]!.frontmatter = { aliases: ["other", "start"], permalink: "entry" };
    allocateRoutes(files);
    expect(allocateRedirects(files, "/blog", new Set(["entry"]))).toEqual({
      "/blog/start/": "/blog/hello/",
    });
  });

  it("keeps dotted alias and permalink segments intact", () => {
    const files = [note("release.md")];
    files[0]!.frontmatter = { aliases: ["v1.2"], permalink: "versions/v1.2" };
    allocateRoutes(files);
    expect(allocateRedirects(files, "/blog")).toEqual({
      "/blog/v1.2/": "/blog/release/",
      "/blog/versions/v1.2/": "/blog/release/",
    });
  });

  it("keeps generated listing routes ahead of aliases", () => {
    const ctx = context([note("hello.md", "")]);
    ctx.files[0]!.frontmatter = { aliases: ["tags", "folders", "feed", "start"] };
    indexContent().indexContent!.run(ctx);
    expect(ctx.index!.routes.redirects).toEqual({ "/blog/start/": "/blog/hello/" });
  });

  it("resolves authored filenames after publication filtering and indexes final hrefs", () => {
    const ctx = context([
      note("hello world.md", "---\ntitle: Spaced\n---\nSpaced body."),
      note("hello-world.md", "---\ntitle: Exact\n---\nExact body."),
      note("hello-world-2.md", "---\ntitle: Numbered\n---\nNumbered body."),
      note("links.md", "[[hello world]] [[hello-world]] [[missing]]"),
      note("private.md", "---\nprivate: true\n---\nHidden body."),
    ]);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    allocateRoutesPlugin().allocateRoutes!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    indexContent().indexContent!.run(ctx);

    expect(ctx.index!.entries.map((entry) => [entry.path, entry.href])).toContainEqual([
      "hello world.md", "/blog/hello-world-3/",
    ]);
    const links = ctx.index!.entries.find((entry) => entry.slug === "links")!;
    expect(links.links.map((link) => link.href)).toEqual([
      "/blog/hello-world-3/", "/blog/hello-world/", null,
    ]);
    expect(ctx.index!.graph.links).toEqual(["hello-world", "hello-world-3"]);
    expect(ctx.files.find((file) => file.path === "links.md")!.content).toContain(
      '<span class="svartz-unresolved-link" role="link" aria-disabled="true">missing</span>',
    );
    expect(ctx.index!.entries.some((entry) => entry.path === "private.md")).toBe(false);
  });

  it("does not rewrite an embed while resolving the same wikilink target", () => {
    const ctx = context([note("hello.md", "Hello"), note("links.md", "[[hello]] ![[hello]]")]);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    allocateRoutesPlugin().allocateRoutes!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files.find((file) => file.path === "links.md")!.content).toContain(
      '<a href="../hello/">hello</a> ![[hello]]',
    );
  });

  it("leaves unresolved wikilinks inside code samples untouched", () => {
    const ctx = context([note("links.md", "[[missing]] `[[missing]]`\n\n```md\n[[missing]]\n```")]);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    allocateRoutesPlugin().allocateRoutes!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain('<span class="svartz-unresolved-link" role="link" aria-disabled="true">missing</span> `[[missing]]`');
    expect(ctx.files[0]!.content).toContain("```md\n[[missing]]\n```");
  });

  it("rewrites only authored Markdown links and keeps code out of the graph", () => {
    const ctx = context([
      note("target.md", "Target"),
      note("links.md", "[target](target.md) `[target](target.md)`\n\n```md\n[private](private.md)\n```"),
      note("private.md", "---\nprivate: true\n---\nSecret"),
    ]);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    allocateRoutesPlugin().allocateRoutes!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    const links = ctx.files.find((file) => file.path === "links.md")!;
    expect(links.content).toContain('<a href="../target/">target</a> `[target](target.md)`');
    expect(links.content).toContain("[private](private.md)");
    expect(links.links).toEqual(["target"]);
  });
});

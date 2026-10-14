import { describe, expect, it } from "vitest";
import type { ProcessedFile, PluginContext, SvartzTheme } from "@svartz/core";
import { createVaultView } from "@svartz/core";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { resolveLinks } from "../src/resolve-links";
import { allocateRoutesPlugin } from "../src/allocate-routes";
import { indexContent } from "../src/index-content";
import { emitDiscovery } from "../src/emit-discovery";
import { allocateRedirects, allocateRoutes } from "../src/internal/routes";
import { fileToSlug } from "../src/internal/slug";

const note = (path: string, content = ""): ProcessedFile => ({
  path,
  extension: path.slice(path.lastIndexOf(".")),
  slug: fileToSlug(path),
  content,
});

function context(files: ProcessedFile[], mountPath = "/blog"): PluginContext {
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
      mountPath,
      target: { type: "host" },
      plugins: [],
    },
    files,
    artifacts: new Map(),
    meta: new Map(),
  };
}

describe("canonical route allocation", () => {
  it.each([".md", ".mdx", ".svx"])("normalizes a frontmatter slug on a %s note", (extension) => {
    const file = note(`Setup Notes${extension}`);
    file.frontmatter = { slug: "Clean & Simple?" };
    allocateRoutes([file]);
    expect(file.slug).toBe("clean-and-simple");
  });

  it("replaces only the last segment and keeps normalized parent folders", () => {
    const file = note("Guides & Tips/Deep Notes/Setup Notes.md");
    file.frontmatter = { slug: "setup" };
    allocateRoutes([file]);
    expect(file.slug).toBe("guides-and-tips/deep-notes/setup");
  });

  it.each([null, undefined, false, 42, {}, [], "", " \t", "?#", "/", "a/b", "/a", "a/"]
    .map((slug) => ({ slug })))(
    "rejects invalid slug $slug with the note path",
    ({ slug }) => {
      const ctx = context([note("guides/setup.md")]);
      ctx.files[0]!.frontmatter = { slug };
      expect(allocateRoutesPlugin().allocateRoutes!.options.fatal).toBe(true);
      expect(() => allocateRoutesPlugin().allocateRoutes!.run(ctx)).toThrow("Invalid slug in guides/setup.md");
    },
  );

  it.each([
    "index.md", "index.mdx", "index.svx", "_index.md", "_index.mdx", "_index.svx",
    "guides/index.md", "guides/index.mdx", "guides/_index.md", "guides/_index.mdx", "guides/Index?.md",
  ])("rejects slug on folder note %s", (path) => {
    const file = note(path);
    file.frontmatter = { slug: "setup" };
    expect(() => allocateRoutes([file])).toThrow(`Invalid slug in ${path}: folder notes cannot set slug.`);
  });

  it.each([false, true])("rejects explicit slugs that normalize to the same URL (reversed: %s)", (reverse) => {
    const files = [note("guides/first.md"), note("guides/second.md")];
    files[0]!.frontmatter = { slug: "Set Up?" };
    files[1]!.frontmatter = { slug: "set-up" };
    if (reverse) files.reverse();
    expect(() => allocateRoutes(files)).toThrow(/Conflicting slug "guides\/set-up".*guides\/(first|second)\.md.*guides\/(first|second)\.md/);
    expect(() => allocateRoutes(files, new Set(["guides/set-up"]))).toThrow(/Conflicting slug/);
  });

  it("allows the same explicit segment in different folders", () => {
    const files = [note("guides/first.md"), note("notes/second.md")];
    for (const file of files) file.frontmatter = { slug: "setup" };
    allocateRoutes(files);
    expect(files.map((file) => file.slug)).toEqual(["guides/setup", "notes/setup"]);
  });

  it.each(["index", "Index"])("rejects slug %s, which would claim the folder URL", (slug) => {
    const file = note("guides/second.md");
    file.frontmatter = { slug };
    expect(() => allocateRoutes([file])).toThrow('Invalid slug in guides/second.md: "index" names the folder, not a note.');
  });

  it.each([false, true])("gives explicit slugs priority over exact filenames (reversed: %s)", (reverse) => {
    const files = [note("hello-world.md"), note("hello-world-2.md"), note("Setup Notes.md")];
    files[2]!.frontmatter = { slug: "hello-world" };
    if (reverse) files.reverse();
    allocateRoutes(files);
    expect(Object.fromEntries(files.map((file) => [file.path, file.slug]))).toEqual({
      "hello-world.md": "hello-world-3",
      "hello-world-2.md": "hello-world-2",
      "Setup Notes.md": "hello-world",
    });
  });

  it.each([false, true])("suffixes explicit slugs behind host routes before natural names (reversed: %s)", (reverse) => {
    const files = [note("about.md"), note("about-2.md"), note("Setup Notes.md")];
    files[2]!.frontmatter = { slug: "about" };
    if (reverse) files.reverse();
    allocateRoutes(files, new Set(["/about/"]));
    expect(Object.fromEntries(files.map((file) => [file.path, file.slug]))).toEqual({
      "about.md": "about-4",
      "about-2.md": "about-2",
      "Setup Notes.md": "about-3",
    });
  });

  it("redirects aliases and permalink to the allocated slug without redirecting the filename", () => {
    const file = note("Setup Notes.md");
    file.frontmatter = { slug: "setup", alias: "old-setup", aliases: ["start"], permalink: "entry" };
    allocateRoutes([file], new Set(["setup"]));
    expect(allocateRedirects([file], "/blog", new Set(["setup"]))).toEqual({
      "/blog/old-setup/": "/blog/setup-2/",
      "/blog/start/": "/blog/setup-2/",
      "/blog/entry/": "/blog/setup-2/",
    });
  });

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

  it("publishes concrete theme pages but leaves dynamic and host-owned paths alone", () => {
    const ctx = context([note("note.md")]);
    ctx.files[0]!.frontmatter = { aliases: ["about", "team"] };
    const page = { default: {} };
    const theme: SvartzTheme = {
      id: "test",
      version: "1.0.0",
      contractVersion: "1.0.0",
      layouts: { defaultPage: page, notePage: page },
      routes: [
        { id: "note", pattern: "/:slug" },
        { id: "about", pattern: "/about", component: page },
        { id: "team", pattern: "/team", component: page },
        { id: "preview", pattern: "/preview", component: page, prerender: false },
        { id: "dynamic", pattern: "/projects/:slug", component: page },
      ],
    };
    ctx.meta.set("svartz:theme", theme);
    ctx.meta.set("reservedRoutes", new Set(["team"]));
    indexContent().indexContent!.run(ctx);

    expect(ctx.index!.routes.all).toContain("/blog/about/");
    expect(ctx.index!.routes.theme).toEqual(["/blog/about/"]);
    expect(ctx.index!.routes.all).not.toContain("/blog/team/");
    expect(ctx.index!.routes.all).not.toContain("/blog/preview/");
    expect(ctx.index!.routes.all).not.toContain("/blog/projects/:slug/");
    expect(ctx.index!.routes.redirects).not.toHaveProperty("/blog/about/");

    const root = context([note("note.md")], "");
    root.meta.set("svartz:theme", theme);
    indexContent().indexContent!.run(root);
    expect(root.index!.routes.all).toContain("/about/");
  });

  it("does not publish a static page shadowed by a higher-priority dynamic route", () => {
    const ctx = context([note("note.md")]);
    const page = { default: {} };
    ctx.meta.set("svartz:theme", {
      id: "test",
      version: "1.0.0",
      contractVersion: "1.0.0",
      layouts: { defaultPage: page, notePage: page },
      routes: [
        { id: "note", pattern: "/:slug", priority: 10 },
        { id: "about", pattern: "/about", component: page },
      ],
    } satisfies SvartzTheme);
    indexContent().indexContent!.run(ctx);
    expect(ctx.index!.routes.theme).not.toContain("/blog/about/");
    expect(ctx.index!.routes.all).not.toContain("/blog/about/");
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

  it("uses allocated slugs for wikilinks, backlinks, graph, search, discovery, and the vault view", async () => {
    const ctx = context([
      note("guides/Setup Notes.md", "---\nslug: setup\ntitle: Setup\n---\nSetup body."),
      note("links.md", "---\nslug: start\n---\n[[guides/Setup Notes]] [[Setup Notes]]"),
      note("private.md", "---\nprivate: true\nslug: []\n---\nHidden body."),
      note("guides/private.md", "---\nprivate: true\nslug: setup\n---\nHidden collision."),
    ]);
    ctx.config.site.url = "https://example.com/site";
    ctx.config.discovery = {
      feed: { enabled: true, limit: 10, content: "summary", sort: "published" },
      sitemap: { enabled: true },
      dateSources: ["frontmatter"],
    };
    parseFrontmatter().parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    allocateRoutesPlugin().allocateRoutes!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    indexContent().indexContent!.run(ctx);
    await emitDiscovery().emitArtifacts!.run(ctx);

    const index = ctx.index!;
    const source = ctx.files.find((file) => file.path === "links.md")!;
    expect(source.content).toContain('<a href="../guides/setup/">guides/Setup Notes</a>');
    expect(source.content).toContain('<a href="../guides/setup/">Setup Notes</a>');
    expect(index.entries.find((entry) => entry.slug === "start")!.links.map((link) => link.href))
      .toEqual(["/blog/guides/setup/", "/blog/guides/setup/"]);
    expect(index.backlinks["guides/setup"]).toEqual(["start"]);
    expect(index.graph.start).toEqual(["guides/setup"]);
    expect(index.search.find((entry) => entry.slug === "guides/setup")?.href).toBe("/blog/guides/setup/");
    expect(index.routes.notes).toEqual(["/blog/guides/setup/", "/blog/start/"]);
    expect(index.routes.redirects).toEqual({});
    expect(index.folders.find((folder) => folder.slug === "guides")?.noteSlugs).toEqual(["guides/setup"]);
    for (const name of ["rss", "sitemap"]) {
      const contents = String(ctx.artifacts.get(`assets/${name}.xml`)?.contents);
      expect(contents).toContain("https://example.com/site/blog/guides/setup/");
      expect(contents).not.toContain("setup-notes/");
      expect(contents).not.toContain("private");
    }
    const vault = createVaultView(index, "blog", "/site");
    expect(vault.note("/site/blog/guides/setup/")?.entry.path).toBe("guides/Setup Notes.md");
    expect(vault.note("guides/setup")?.backlinks.map((entry) => entry.href)).toEqual(["/site/blog/start/"]);
    expect(vault.note("start")?.outgoing.map((entry) => entry.href)).toEqual(["/site/blog/guides/setup/"]);
    expect(vault.search.find((entry) => entry.slug === "guides/setup")?.href).toBe("/site/blog/guides/setup/");
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

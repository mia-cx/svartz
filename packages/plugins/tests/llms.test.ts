import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile, ResolvedConfig } from "@svartz/core";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { allocateRoutesPlugin } from "../src/allocate-routes";
import { resolveLinks } from "../src/resolve-links";
import { transformDescription } from "../src/transform-description";
import { indexContent } from "../src/index-content";
import { emitDiscovery } from "../src/emit-discovery";
import { fileToSlug } from "../src/internal/slug";

const file = (path: string, content = ""): ProcessedFile => ({
  path,
  extension: path.slice(path.lastIndexOf(".")),
  slug: fileToSlug(path),
  content,
});

const setup = [
  "---",
  "title: Setup",
  "description: Install the CLI.",
  "---",
  "Read [[reference/api#Auth Flow|the API]] and [the next step](next.md).",
  "%%draft: ask legal first%%",
  "<!-- reviewer: rewrite this -->",
  "![[diagram.png|300]] ![[api]] ![Flow](../diagram.png)",
  "See [[missing]].",
  "",
  "```md",
  "%%keep%% [[keep]]",
  "```",
].join("\n");

function build(vault: ProcessedFile[], config: { url?: string; enabled?: boolean } = {}) {
  const ctx: PluginContext = {
    config: {
      version: "1.0.0",
      id: "docs",
      path: "/vault",
      outDir: "/out/dist",
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
      site: { title: "Docs", description: "How to use it.", url: config.url },
      mountPath: "/docs",
      target: { type: "host" },
      plugins: [],
      discovery: {
        feed: { enabled: false, limit: 10, content: "summary", sort: "published" },
        sitemap: { enabled: false },
        llms: { enabled: config.enabled ?? true },
      },
    } as unknown as ResolvedConfig,
    files: vault,
    artifacts: new Map(),
    meta: new Map(),
  };
  parseFrontmatter().parseFrontmatter!.run(ctx);
  filterUnpublished().filterUnpublished!.run(ctx);
  allocateRoutesPlugin().allocateRoutes!.run(ctx);
  resolveLinks().resolveLinks!.run(ctx);
  transformDescription().transformDescription!.run(ctx);
  return ctx;
}

async function emit(ctx: PluginContext) {
  indexContent().indexContent!.run(ctx);
  await emitDiscovery().emitArtifacts!.run(ctx);
  return (name: string) => ctx.artifacts.get(`assets/${name}`)?.contents as string | undefined;
}

const vault = () => [
  file("index.md", "---\ntitle: Home\n---\nWelcome."),
  file("guides/setup.md", setup),
  file("guides/next.md", "---\ntitle: Next steps\n---\n# Next steps\n\nDone."),
  file("reference/api.md", "---\ntitle: API\ndescription: Endpoints.\n---\n## Auth Flow\n\nTokens."),
  file("widget.svx", "---\ntitle: Widget\ndescription: A counter.\n---\n<script>const secret = 'token';</script>\n# Widget\n\n<Counter />"),
  file("diagram.png"),
];

describe("Markdown copies for LLM agents", () => {
  it("writes each public page as Markdown with links to the other copies", async () => {
    const asset = await emit(build(vault()));
    expect(asset("guides/setup.md")).toBe([
      "---",
      "title: Setup",
      "description: Install the CLI.",
      "---",
      "",
      "# Setup",
      "",
      "Read [the API](../reference/api.md#auth-flow) and [the next step](next.md).",
      "",
      "![](../diagram.png) [api](../reference/api.md) ![Flow](../diagram.png)",
      "See missing.",
      "",
      "```md",
      "%%keep%% [[keep]]",
      "```",
      "",
    ].join("\n"));
    // An extracted description joins the published properties too.
    expect(asset("guides/next.md")).toBe("---\ntitle: Next steps\ndescription: Done.\n---\n\n# Next steps\n\nDone.\n");
    expect(asset("index.md")).toBe("---\ntitle: Home\ndescription: Welcome.\n---\n\n# Home\n\nWelcome.\n");
    // Svelte script stays out; the authored markup stays in.
    expect(asset("widget.md")).toBe("---\ntitle: Widget\ndescription: A counter.\n---\n\n# Widget\n\n<Counter />\n");
  });

  it("indexes every copy in llms.txt and links absolutely when the site has a URL", async () => {
    const ctx = build(vault(), { url: "https://example.com/site" });
    const asset = await emit(ctx);
    expect(asset("llms.txt")).toBe([
      "# Docs",
      "",
      "> How to use it.",
      "",
      "Each page links to a Markdown copy of its content.",
      "",
      "## Pages",
      "",
      "- [Home](https://example.com/site/docs/index.md): Welcome.",
      "- [Next steps](https://example.com/site/docs/guides/next.md): Done.",
      "- [Setup](https://example.com/site/docs/guides/setup.md): Install the CLI.",
      "- [API](https://example.com/site/docs/reference/api.md): Endpoints.",
      "- [Widget](https://example.com/site/docs/widget.md): A counter.",
      "",
    ].join("\n"));
    expect(asset("guides/setup.md")).toContain("[the next step](https://example.com/site/docs/guides/next.md)");
    expect(ctx.index!.entries.find((entry) => entry.slug === "guides/setup")?.markdownHref).toBe("/docs/guides/setup.md");
  });

  it("gives a protected note no copy and links to its locked page instead", async () => {
    const ctx = build(vault());
    ctx.files.find((note) => note.path === "reference/api.md")!.protection = { group: "staff", hidden: false };
    const asset = await emit(ctx);
    expect(asset("reference/api.md")).toBeUndefined();
    expect(asset("llms.txt")).not.toContain("API");
    expect(asset("guides/setup.md")).toContain("[the API](../reference/api/#auth-flow)");
    expect(ctx.index!.entries.find((entry) => entry.slug === "reference/api")?.markdownHref).toBeUndefined();
  });

  it("rewrites every attachment and reference link for the copy's location", async () => {
    const landing = [
      "---",
      "title: Guides",
      "description: Start here.",
      "---",
      "![Flow][diagram] and [the setup][setup].",
      "",
      '<img src="diagram.svg" srcset="diagram.svg 1x, diagram@2x.svg 2x" />',
      "",
      "[Manual](manual.pdf#page=3) ![Logo](sprite.svg#logo?v=2)",
      "",
      "[diagram]: diagram.svg",
      "[setup]: <setup.md#Install Steps>",
    ].join("\n");
    const asset = await emit(build([
      file("guides/index.md", landing),
      file("guides/setup.md", "# Setup"),
      file("guides/diagram.svg"),
      file("guides/diagram@2x.svg"),
      file("guides/manual.pdf"),
      file("guides/sprite.svg"),
    ]));
    expect(asset("guides.md")).toBe([
      "---",
      "title: Guides",
      "description: Start here.",
      "---",
      "",
      "# Guides",
      "",
      "![Flow][diagram] and [the setup][setup].",
      "",
      '<img src="guides/diagram.svg" srcset="guides/diagram.svg 1x, guides/diagram%402x.svg 2x" />',
      "",
      "[Manual](guides/manual.pdf#page=3) ![Logo](guides/sprite.svg#logo?v=2)",
      "",
      "[diagram]: guides/diagram.svg",
      "[setup]: <guides/setup.md#install-steps>",
      "",
    ].join("\n"));
  });

  it("keeps a rewritten link's label markup and title, and external reference URLs as authored", async () => {
    const body = [
      "---",
      "title: Links",
      "description: Both kinds.",
      "---",
      '[Run `setup` *first*](setup.md "Install") and [the site][external].',
      "",
      "[external]: https://example.com/setup.md#Install",
    ].join("\n");
    const asset = await emit(build([file("links.md", body), file("setup.md", "# Setup")]));
    expect(asset("links.md")).toContain('[Run `setup` *first*](setup.md "Install") and [the site][external].');
    expect(asset("links.md")).toContain("[external]: https://example.com/setup.md#Install");
  });

  it("keeps code whitespace and leaves host-owned Markdown URLs to the host", async () => {
    const code = "```js\nconst text = `a\n\n\n  \nb`;\n```";
    const properties = "---\ntitle: Snippet\ndescription: Code.\n---\n";
    const ctx = build([file("snippet.md", `${properties}# Snippet\n\n%%hidden%%\n\n\n${code}`), file("api.md", "# API")]);
    ctx.meta.set("reservedRoutes", new Set(["api.md"]));
    const asset = await emit(ctx);
    expect(asset("snippet.md")).toBe(`${properties}\n# Snippet\n\n${code}\n`);
    expect(asset("api.md")).toBeUndefined();
    expect(asset("llms.txt")).not.toContain("api.md");
  });

  it("writes nothing when the vault disables it", async () => {
    const ctx = build(vault(), { enabled: false });
    await emit(ctx);
    expect([...ctx.artifacts.keys()]).toEqual([]);
    expect(ctx.index!.entries.some((entry) => entry.markdownHref)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { IndexEntry, PluginContext, ProcessedFile, ResolvedConfig } from "@svartz/core";
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

function build(vault: ProcessedFile[], config: {
  url?: string;
  enabled?: boolean;
  optional?: boolean;
  frontmatter?: Partial<ResolvedConfig["frontmatter"]>;
} = {}) {
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
        ...config.frontmatter,
      },
      site: { title: "Docs", description: "How to use it.", url: config.url },
      mountPath: "/docs",
      target: { type: "host" },
      plugins: [],
      discovery: {
        feed: { enabled: false, limit: 10, content: "summary", sort: "published" },
        sitemap: { enabled: false },
        llms: { enabled: config.enabled ?? true, optional: config.optional ?? false },
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
  it.each([
    { name: "missing", fields: "", properties: {}, title: "Note", description: "Body text." },
    { name: "authored", fields: "title: Authored\ndescription: Summary.\n", properties: { title: "Authored", description: "Summary." }, title: "Authored", description: "Summary." },
    { name: "empty", fields: 'title: ""\ndescription: ""\n', properties: { title: "", description: "" }, title: "Note", description: "Body text." },
    { name: "non-string", fields: "title: 42\ndescription: false\n", properties: { title: 42, description: false }, title: "Note", description: "Body text." },
    { name: "null", fields: "title: null\ndescription: null\n", properties: { title: null, description: null }, title: "Note", description: "Body text." },
    { name: "authored title", fields: "title: Authored\n", properties: { title: "Authored" }, title: "Authored", description: "Body text." },
    { name: "authored description", fields: "description: Summary.\n", properties: { description: "Summary." }, title: "Note", description: "Summary." },
  ])("keeps $name properties authored while copies retain display metadata", async ({ fields, properties, title, description }) => {
    const ctx = build([file("Note.md", `---\n${fields}category: guide\n---\nBody text.`)]);
    const asset = await emit(ctx);
    const entry = ctx.index!.entries[0]!;
    expect(entry.properties).toEqual({ ...properties, category: "guide" });
    expect(entry.title).toBe(title);
    expect(entry.description).toBe(description);
    expect(asset("note.md")).toContain(`title: ${title}\n`);
    expect(asset("note.md")).toContain(`description: ${description}\n`);
    expect(asset("note.md")).toContain("category: guide\n");
  });

  it("respects configured fields and retains metadata added by later plugins", async () => {
    const ctx = build([file("Note.md", '---\nheading: ""\ntitle: Ordinary property\n---\nBody text.')], {
      frontmatter: { titleField: "heading", descriptionField: "summary" },
    });
    ctx.files[0]!.frontmatter!.plugin = "Added later";
    const asset = await emit(ctx);
    const entry = ctx.index!.entries[0]!;
    expect(entry.properties).toEqual({ heading: "", title: "Ordinary property", plugin: "Added later" });
    expect(entry.title).toBe("Note");
    expect(entry.description).toBe("Body text.");
    expect(asset("note.md")).toContain("heading: Note\n");
    expect(asset("note.md")).toContain("summary: Body text.\n");
    expect(asset("note.md")).toContain("plugin: Added later\n");
  });

  it("publishes a later plugin's title and description overrides", async () => {
    const ctx = build([file("Note.md", "Body text.")]);
    Object.assign(ctx.files[0]!.frontmatter!, { title: "Plugin title", description: "Plugin summary." });
    const asset = await emit(ctx);
    expect(ctx.index!.entries[0]!.properties).toEqual({ title: "Plugin title", description: "Plugin summary." });
    expect(asset("note.md")).toContain("title: Plugin title\ndescription: Plugin summary.\n");
  });

  it("does not apply stale defaults when a rebuild disables the description transform", async () => {
    const ctx = build([file("Note.md", "Body text.")]);
    await emit(ctx);
    ctx.files = [file("Note.md", "---\ntitle: Note\ndescription: Body text.\n---\nNew body.")];
    parseFrontmatter().parseFrontmatter!.run(ctx);
    const asset = await emit(ctx);
    expect(ctx.index!.entries[0]!.properties).toEqual({ title: "Note", description: "Body text." });
    expect(asset("note.md")).toContain("title: Note\ndescription: Body text.\n");
  });

  it("preserves authored properties in protected entries and redacts their public shells", async () => {
    const ctx = build([file("Note.md", '---\ntitle: ""\ncategory: staff\n---\nSecret text.')]);
    ctx.files[0]!.protection = { group: "staff", hidden: false };
    const asset = await emit(ctx);
    const protectedEntries = ctx.meta.get("svartz:protectedEntries") as Map<string, IndexEntry[]>;
    expect(protectedEntries.get("staff")![0]).toMatchObject({
      title: "Note",
      description: "Secret text.",
      properties: { title: "", category: "staff" },
    });
    expect(ctx.index!.entries[0]!.properties).toEqual({});
    expect(asset("note.md")).toBeUndefined();
  });

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
      "Each page links to a Markdown copy of its content. [llms-full.txt](https://example.com/site/docs/llms-full.txt) holds every page in one file.",
      "",
      "## Pages",
      "",
      "- [Home](https://example.com/site/docs/index.md): Welcome.",
      "- [Widget](https://example.com/site/docs/widget.md): A counter.",
      "",
      "## Guides",
      "",
      "- [Next steps](https://example.com/site/docs/guides/next.md): Done.",
      "- [Setup](https://example.com/site/docs/guides/setup.md): Install the CLI.",
      "",
      "## Reference",
      "",
      "- [API](https://example.com/site/docs/reference/api.md): Endpoints.",
      "",
    ].join("\n"));
    expect(asset("guides/setup.md")).toContain("[the next step](https://example.com/site/docs/guides/next.md)");
    expect(ctx.index!.entries.find((entry) => entry.slug === "guides/setup")?.markdownHref).toBe("/docs/guides/setup.md");
  });

  const explorerVault = () => [
    file("index.md", "---\ntitle: Home\n---\nWelcome."),
    file("about.md", "---\ntitle: About\n---\nWho we are."),
    file("appendix/api.md", "---\ntitle: API\n---\nEndpoints."),
    file("guides/index.md", "---\ntitle: Guides\norder: 1\n---\nStart here. Then read [[step-2]]."),
    file("guides/step-10.md", "---\ntitle: Step 10\ntags: [advanced]\n---\nLast."),
    file("guides/step-2.md", "---\ntitle: Step 2\n---\nSecond."),
    file("guides/zeta.md", "---\ntitle: Zeta\norder: 1\n---\nFirst."),
    file("guides/deep/dive.md", "---\ntitle: Dive\n---\nDeeper."),
  ];

  it("sections llms.txt by top-level folder in explorer order", async () => {
    const asset = await emit(build(explorerVault()));
    // A folder's `order` comes from its folder note, which leads its section. Folders list before notes, then
    // `order`, then titles in natural order.
    expect(asset("llms.txt")).toBe([
      "# Docs",
      "",
      "> How to use it.",
      "",
      "Each page links to a Markdown copy of its content. [llms-full.txt](llms-full.txt) holds every page in one file.",
      "",
      "## Pages",
      "",
      "- [Home](index.md): Welcome.",
      "- [About](about.md): Who we are.",
      "",
      "## Guides",
      "",
      "- [Guides](guides.md): Start here. Then read step-2.",
      "- [Dive](guides/deep/dive.md): Deeper.",
      "- [Zeta](guides/zeta.md): First.",
      "- [Step 2](guides/step-2.md): Second.",
      "- [Step 10](guides/step-10.md): Last.",
      "",
      "## Appendix",
      "",
      "- [API](appendix/api.md): Endpoints.",
      "",
    ].join("\n"));
  });

  it("writes every page into llms-full.txt in llms.txt order, linking from its own location", async () => {
    const asset = await emit(build(explorerVault(), { url: "https://example.com" }));
    expect(asset("llms-full.txt")).toBe([
      "# Docs",
      "",
      "> How to use it.",
      "",
      ...[
        ["Home", "", "Welcome."],
        ["About", "about/", "Who we are."],
        ["Guides", "guides/", "Start here. Then read [step-2](https://example.com/docs/guides/step-2.md)."],
        ["Dive", "guides/deep/dive/", "Deeper."],
        ["Zeta", "guides/zeta/", "First."],
        ["Step 2", "guides/step-2/", "Second."],
        ["Step 10", "guides/step-10/", "Last."],
        ["API", "appendix/api/", "Endpoints."],
      ].flatMap(([title, path, body]) => [`# ${title}`, "", `Source: https://example.com/docs/${path}`, "", body, ""]),
    ].join("\n"));
  });

  it("lists tag pages, folder listings and the feed under Optional only when asked", async () => {
    expect(await emit(build(explorerVault())).then((asset) => asset("llms.txt"))).not.toContain("## Optional");
    const asset = await emit(build(explorerVault(), { optional: true }));
    expect(asset("llms.txt")!.split("## Optional\n\n")[1]).toBe([
      "- [Tags](tags/): Every tag.",
      "- [#advanced](tags/advanced/): Pages tagged advanced.",
      "- [Folders](folders/): Every folder.",
      "- [Appendix](folders/appendix/): Pages in the Appendix folder.",
      "- [Guides](folders/guides/): Pages in the Guides folder.",
      "- [Deep](folders/guides/deep/): Pages in the Deep folder.",
      "- [Feed](feed/): The latest pages.",
      "",
    ].join("\n"));
  });

  it("leaves llms.txt and llms-full.txt to a host route that owns them", async () => {
    expect(await emit(build(vault())).then((asset) => asset("llms-full.txt"))).toBeDefined();
    const ctx = build(vault());
    ctx.meta.set("reservedRoutes", new Set(["llms.txt", "llms-full.txt"]));
    const asset = await emit(ctx);
    expect(asset("llms.txt")).toBeUndefined();
    expect(asset("llms-full.txt")).toBeUndefined();
    expect(asset("guides/setup.md")).toBeDefined();
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
      "",
      "> > [Quoted](",
      "> > setup.md)",
      "",
      "[external]: https://example.com/setup.md#Install",
    ].join("\n");
    const asset = await emit(build([file("links.md", body), file("setup.md", "# Setup")]));
    // A destination on the next quoted line keeps the line's markers.
    expect(asset("links.md")).toContain("> > [Quoted](\n> > setup.md)");
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

import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile, ResolvedConfig } from "@svartz/core";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { allocateRoutesPlugin } from "../src/allocate-routes";
import { resolveLinks } from "../src/resolve-links";
import { transformDescription } from "../src/transform-description";
import { indexContent } from "../src/index-content";
import { fileToSlug } from "../src/internal/slug";

const file = (path: string, content = ""): ProcessedFile => ({
  path,
  extension: path.slice(path.lastIndexOf(".")),
  slug: fileToSlug(path),
  content,
});

function index(vault: ProcessedFile[], markdown: boolean) {
  const ctx: PluginContext = {
    config: {
      version: "1.0.0",
      id: "blog",
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
      site: { title: "Blog" },
      mountPath: "/blog",
      target: { type: "host" },
      plugins: [],
      index: { markdown },
      discovery: {
        feed: { enabled: false, limit: 10, content: "summary", sort: "published" },
        sitemap: { enabled: false },
        llms: { enabled: false },
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
  indexContent().indexContent!.run(ctx);
  return new Map(ctx.index!.entries.map((entry) => [entry.slug, entry]));
}

const vault = () => [
  file("Crunch Time.md", [
    "---",
    "description: A missed deadline.",
    "---",
    "Read [[Mastering#Low End|the low end]] and [the gear post](gear/streaming.md).",
    "%%private aside%%",
    "![[cover.png]]",
    "See [[Draft]], [the draft](Draft.md), [the about page](/about) and [[missing]].",
    "%%private ![hidden%%](cover.png) public",
    "",
    "## Aftermath",
  ].join("\n")),
  file("Mastering.md", "## Low End\n\nMono below 120 Hz."),
  file("gear/streaming.md", "Budget gear."),
  file("Draft.md", "---\ndraft: true\n---\nNot yet."),
  file("cover.png"),
  file("Widget.svx", '<div data-example="%%">Example</div>\n\n%%private secret%%\n\nPublic'),
];

describe("index.markdown", () => {
  it("gives each entry its body with links to pages and attachments", () => {
    const entry = index(vault(), true).get("crunch-time")!;
    expect(entry.markdown).toBe([
      "Read [the low end](/blog/mastering/#low-end) and [the gear post](/blog/gear/streaming/).",
      "",
      "![](/blog/cover.png)",
      "See Draft, the draft, [the about page](/about) and missing.",
      "](cover.png) public",
      "",
      "## Aftermath",
    ].join("\n"));
    expect(index(vault(), true).get("gear/streaming")!.markdown).toBe("Budget gear.");
  });

  it("treats %% in an executable note's HTML as markup, as the page does", () => {
    expect(index(vault(), true).get("widget")!.markdown).toBe('<div data-example="%%">Example</div>\n\nPublic');
  });

  it("leaves the index as it was when the vault doesn't ask for it", () => {
    expect(index(vault(), false).get("crunch-time")!.markdown).toBeUndefined();
  });
});

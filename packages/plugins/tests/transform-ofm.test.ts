import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { transformOfm } from "../src/transform-ofm";

function makeCtx(content: string): PluginContext {
  const files: ProcessedFile[] = [
    {
      path: "note.md",
      slug: "note",
      extension: ".md",
      content,
    },
  ];

  return {
    config: {
      version: "0.0.1",
      id: "test",
      path: "/vault",
      outDir: "/out",
      include: [],
      exclude: [],
      linkResolution: "closest",
      theme: { base: "default" },
      frontmatter: {
        titleField: "title",
        descriptionField: "description",
        tagsField: "tags",
        aliasesField: "aliases",
        createdAtField: "created_at",
        updatedAtField: "updated_at",
        publishedField: "published",
      },
      target: { type: "static" },
      plugins: [],
    },
    files,
    artifacts: new Map(),
    meta: new Map(),
  } as PluginContext;
}

describe("transformOfm", () => {
  it("escapes bare empty angle brackets outside code fences", () => {
    const ctx = makeCtx("- /widget?token=<>\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain("&lt;&gt;");
  });

  it("escapes invalid inline angle-bracket sequences that would break Svelte parsing", () => {
    const ctx = makeCtx("- Sorting (amount of posts/releases, a<->z)\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain("a&lt;-&gt;z");
  });

  it("preserves raw html comment syntax as hidden comments", () => {
    const ctx = makeCtx("_<!-- later on -->_\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain("<!-- later on -->");
  });

  it("converts obsidian %% comments into html comments", () => {
    const ctx = makeCtx("before %% hidden note %% after\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain("<!-- hidden note -->");
  });
});

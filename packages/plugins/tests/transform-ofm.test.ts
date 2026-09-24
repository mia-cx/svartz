import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { transformOfm } from "../src/transform-ofm";
import { transformEmbeds } from "../src/transform-embeds";

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
  it("links inline tags while leaving numeric tags and code alone", () => {
    const ctx = makeCtx("A #Topic/sub and #123. `#code`\n\n```md\n#fenced\n```");
    transformOfm().transformOfm!.run(ctx);
    expect(ctx.files[0]!.inlineTags).toEqual(["topic/sub"]);
    expect(ctx.files[0]!.content).toContain('<a class="tag-link" href="../tags/topic/sub/">#Topic/sub</a>');
    expect(ctx.files[0]!.content).toContain("#123. `#code`");
    expect(ctx.files[0]!.content).toContain("#fenced");
  });

  it("does not nest tag links inside formatted Markdown links", () => {
    const ctx = makeCtx('[**#topic**](/docs) and <a href="/docs">#other</a> and #topic');
    transformOfm().transformOfm!.run(ctx);
    expect(ctx.files[0]!.content).toContain("[**#topic**](/docs)");
    expect(ctx.files[0]!.content).toContain('<a href="/docs">#other</a>');
    expect(ctx.files[0]!.content).toContain('<a class="tag-link" href="../tags/topic/">#topic</a>');
    expect(ctx.files[0]!.inlineTags).toEqual(["topic"]);
  });

  it("links tags introduced by published note embeds", () => {
    const ctx = makeCtx("![[target]]");
    ctx.files.push({ path: "target.md", slug: "target", extension: ".md", content: "Body #topic" });
    ctx.meta.set("sourceBodies", new Map(ctx.files.map((file) => [file.path, file.content])));
    transformOfm().transformOfm!.run(ctx);
    transformEmbeds().transformEmbeds!.run(ctx);
    expect(ctx.files[0]!.content).toContain('<a class="tag-link" href="../tags/topic/">#topic</a>');
    expect(ctx.files[0]!.inlineTags).toEqual(["topic"]);
  });

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

  it("preserves ordinary markdown blockquotes", () => {
    const ctx = makeCtx("> Quoted text\n> continues here\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toBe("> Quoted text\n> continues here\n");
  });

  it("preserves callout type and closed fold state without breaking the blockquote", () => {
    const ctx = makeCtx("> [!warning]- Read this first\n> Callout body\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain(
      '> <span class="callout-marker" data-callout="warning" data-callout-fold="closed" aria-hidden="true"></span> **Read this first**',
    );
    expect(ctx.files[0]!.content).toContain("> Callout body");
  });

  it("uses the callout type as the default title and preserves open fold state", () => {
    const ctx = makeCtx("> [!important]+\n> Callout body\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain(
      '> <span class="callout-marker" data-callout="important" data-callout-fold="open" aria-hidden="true"></span> **Important**',
    );
  });

  it("does not transform OFM syntax inside fenced or inline code", () => {
    const ctx = makeCtx(
      [
        "outside ==highlight== and %% hidden %%",
        "",
        "```md",
        "literal ==highlight==",
        "> [!note] literal callout",
        "%% literal comment %%",
        "```",
        "",
        "inline `==highlight== %% comment %%` remains literal",
      ].join("\n"),
    );

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain(
      "outside <mark>highlight</mark> and <!-- hidden -->",
    );
    expect(ctx.files[0]!.content).toContain(
      [
        "```md",
        "literal ==highlight==",
        "> [!note] literal callout",
        "%% literal comment %%",
        "```",
      ].join("\n"),
    );
    expect(ctx.files[0]!.content).toContain(
      "inline `==highlight== %% comment %%` remains literal",
    );
  });

  it("restores interleaved code and comments without placeholder collisions", () => {
    const ctx = makeCtx(
      "`code` before <!-- hidden --> after __SVARTZ_PROTECTED_SEGMENT_0__\n",
    );

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toBe(
      "`code` before <!-- hidden --> after __SVARTZ_PROTECTED_SEGMENT_0__\n",
    );
  });

  it("restores nested placeholders and replacement tokens literally", () => {
    const source = "%% hidden `code $&` %% and `literal $&`";
    const ctx = makeCtx(source);
    transformOfm().transformOfm!.run(ctx);
    expect(ctx.files[0]!.content).toBe("<!-- hidden `code $&` --> and `literal $&`");
  });

  it("transforms nested list prose that starts with four spaces", () => {
    const ctx = makeCtx("- Parent\n    - Child ==highlight== %% hidden %% #topic\n");
    transformOfm().transformOfm!.run(ctx);
    expect(ctx.files[0]!.content).toContain("    - Child <mark>highlight</mark> <!-- hidden -->");
    expect(ctx.files[0]!.content).toContain('class="tag-link"');
  });

  it("does not transform indented or blockquoted fenced code", () => {
    const ctx = makeCtx(
      [
        "    ==indented== %% literal %%",
        "",
        "  ```md",
        "  ==indented fence== %% literal %%",
        "  ```",
        "",
        "> ~~~md",
        "> ==quoted fence== %% literal %%",
        "> ~~~",
      ].join("\n"),
    );

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain("    ==indented== %% literal %%");
    expect(ctx.files[0]!.content).toContain(
      [
        "  ```md",
        "  ==indented fence== %% literal %%",
        "  ```",
      ].join("\n"),
    );
    expect(ctx.files[0]!.content).toContain(
      [
        "> ~~~md",
        "> ==quoted fence== %% literal %%",
        "> ~~~",
      ].join("\n"),
    );
  });

  it("preserves nested blockquote prefixes for nested callouts", () => {
    const ctx = makeCtx("> > [!warning]- Nested warning\n> > Nested body\n");

    transformOfm().transformOfm!.run(ctx);

    expect(ctx.files[0]!.content).toContain(
      '> > <span class="callout-marker" data-callout="warning" data-callout-fold="closed" aria-hidden="true"></span> **Nested warning**',
    );
    expect(ctx.files[0]!.content).toContain("> > Nested body");
  });
});

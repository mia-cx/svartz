import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { resolveLinks } from "../src/resolve-links";
import { transformDescription } from "../src/transform-description";
import { indexContent } from "../src/index-content";
import type { PluginContext, ProcessedFile } from "@svartz/core";

const makeCtx = (files: ProcessedFile[]): PluginContext =>
  ({
    config: { version: "0.0.1", configDir: ".", vaults: [] },
    vault: {
      id: "test",
      path: "/vault",
      outDir: "/out",
      include: [],
      exclude: [],
      linkResolution: "closest" as const,
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
    meta: new Map(),
  }) as PluginContext;

describe("pipeline integration: parse -> filter -> resolve -> transform -> index", () => {
  it("runs a full pipeline on two linked files", () => {
    const files: ProcessedFile[] = [
      {
        path: "notes/hello.md",
        slug: "notes/hello",
        content: `---
title: Hello World
tags: [greeting]
published: true
---
This is a hello page. See [[goodbye]] for farewell.`,
      },
      {
        path: "notes/goodbye.md",
        slug: "notes/goodbye",
        content: `---
title: Goodbye World
tags: [farewell]
published: true
---
This is a goodbye page. Links to [[hello]].`,
      },
    ];

    const ctx = makeCtx(files);

    const parse = parseFrontmatter();
    parse.parseFrontmatter!.run(ctx);

    expect(ctx.files[0]!.frontmatter?.title).toBe("Hello World");
    expect(ctx.files[0]!.rawLinks).toHaveLength(1);
    expect(ctx.files[0]!.rawLinks![0]!.target).toBe("goodbye");

    const filter = filterUnpublished();
    filter.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(2);

    const resolve = resolveLinks();
    resolve.resolveLinks!.run(ctx);
    expect(ctx.files[0]!.links).toContain("notes/goodbye");
    expect(ctx.files[1]!.links).toContain("notes/hello");

    const desc = transformDescription();
    desc.transformDescription!.run(ctx);
    expect(ctx.files[0]!.frontmatter?.description).toBeDefined();
    expect(typeof ctx.files[0]!.frontmatter?.description).toBe("string");

    const index = indexContent();
    index.indexContent!.run(ctx);

    expect(ctx.index).toBeDefined();
    expect(ctx.index!.entries).toHaveLength(2);
    expect(ctx.index!.graph["notes/hello"]).toContain("notes/goodbye");
    expect(ctx.index!.graph["notes/goodbye"]).toContain("notes/hello");
    expect(ctx.index!.backlinks["notes/goodbye"]).toContain("notes/hello");
    expect(ctx.index!.backlinks["notes/hello"]).toContain("notes/goodbye");
  });

  it("filters unpublished files before indexing", () => {
    const files: ProcessedFile[] = [
      {
        path: "draft.md",
        slug: "draft",
        content: `---
title: Draft
published: false
---
This is a draft.`,
      },
      {
        path: "public.md",
        slug: "public",
        content: `---
title: Public
published: true
---
This is public.`,
      },
    ];

    const ctx = makeCtx(files);

    const parse = parseFrontmatter();
    parse.parseFrontmatter!.run(ctx);

    const filter = filterUnpublished();
    filter.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]!.slug).toBe("public");

    const index = indexContent();
    index.indexContent!.run(ctx);
    expect(ctx.index!.entries).toHaveLength(1);
    expect(ctx.index!.entries[0]!.slug).toBe("public");
  });
});

describe("artifact determinism", () => {
  it("produces identical index output for identical input across runs", () => {
    const makeFiles = (): ProcessedFile[] => [
      {
        path: "b.md",
        slug: "b",
        content: `---
title: B
tags: [x]
---
Links to [[a]].`,
      },
      {
        path: "a.md",
        slug: "a",
        content: `---
title: A
tags: [y]
---
Links to [[b]].`,
      },
    ];

    const run = () => {
      const ctx = makeCtx(makeFiles());
      const parse = parseFrontmatter();
      parse.parseFrontmatter!.run(ctx);
      const resolve = resolveLinks();
      resolve.resolveLinks!.run(ctx);
      const index = indexContent();
      index.indexContent!.run(ctx);
      return ctx.index!;
    };

    const idx1 = run();
    const idx2 = run();

    expect(idx1.entries.map((e) => e.slug)).toEqual(
      idx2.entries.map((e) => e.slug),
    );
    expect(Object.keys(idx1.graph).sort()).toEqual(
      Object.keys(idx2.graph).sort(),
    );
    expect(Object.keys(idx1.backlinks).sort()).toEqual(
      Object.keys(idx2.backlinks).sort(),
    );

    expect(JSON.stringify(idx1)).toBe(JSON.stringify(idx2));
  });

  it("entries are sorted by slug", () => {
    const files: ProcessedFile[] = [
      { path: "z.md", slug: "z", content: "---\ntitle: Z\n---\nZ content." },
      { path: "a.md", slug: "a", content: "---\ntitle: A\n---\nA content." },
      { path: "m.md", slug: "m", content: "---\ntitle: M\n---\nM content." },
    ];

    const ctx = makeCtx(files);
    const parse = parseFrontmatter();
    parse.parseFrontmatter!.run(ctx);
    const index = indexContent();
    index.indexContent!.run(ctx);

    expect(ctx.index!.entries.map((e) => e.slug)).toEqual(["a", "m", "z"]);
  });

  it("graph keys are sorted", () => {
    const files: ProcessedFile[] = [
      { path: "z.md", slug: "z", content: "---\ntitle: Z\n---\n[[a]]" },
      { path: "a.md", slug: "a", content: "---\ntitle: A\n---\n[[z]]" },
    ];

    const ctx = makeCtx(files);
    const parse = parseFrontmatter();
    parse.parseFrontmatter!.run(ctx);
    const resolve = resolveLinks();
    resolve.resolveLinks!.run(ctx);
    const index = indexContent();
    index.indexContent!.run(ctx);

    expect(Object.keys(ctx.index!.graph)).toEqual(["a", "z"]);
    expect(Object.keys(ctx.index!.backlinks)).toEqual(["a", "z"]);
  });
});

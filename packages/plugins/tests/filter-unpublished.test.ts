import { describe, it, expect } from "vitest";
import { filterUnpublished } from "../src/filter-unpublished";
import type { PluginContext, ProcessedFile } from "@svartz/core";

const makeCtx = (
  files: ProcessedFile[],
  publishedField = "published",
): PluginContext =>
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
        publishedField,
      },
      target: { type: "static" },
      plugins: [],
    },
    files,
    meta: new Map(),
  }) as PluginContext;

const makeFile = (
  slug: string,
  published?: unknown,
): ProcessedFile => ({
  path: `${slug}.md`,
  slug,
  content: "body",
  frontmatter:
    published !== undefined ? { published } : {},
});

describe("core:filter-unpublished", () => {
  const plugin = filterUnpublished();

  it("keeps files with published: true", () => {
    const ctx = makeCtx([makeFile("a", true)]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(1);
  });

  it("keeps files with published: datetime string", () => {
    const ctx = makeCtx([makeFile("a", "2025-01-01")]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(1);
  });

  it("keeps files with published missing (undefined)", () => {
    const ctx = makeCtx([makeFile("a")]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(1);
  });

  it("keeps files with published: null", () => {
    const ctx = makeCtx([makeFile("a", null)]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(1);
  });

  it("removes files with published: false", () => {
    const ctx = makeCtx([makeFile("a", false)]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(0);
  });

  it("removes files with published: empty string", () => {
    const ctx = makeCtx([makeFile("a", "")]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files).toHaveLength(0);
  });

  it("mixed: filters correctly", () => {
    const ctx = makeCtx([
      makeFile("keep-true", true),
      makeFile("keep-date", "2025-06-01"),
      makeFile("keep-missing"),
      makeFile("remove-false", false),
      makeFile("remove-empty", ""),
      makeFile("keep-null", null),
    ]);
    plugin.filterUnpublished!.run(ctx);
    expect(ctx.files.map((f) => f.slug)).toEqual([
      "keep-true",
      "keep-date",
      "keep-missing",
      "keep-null",
    ]);
  });

  it("sets enforce: post", () => {
    expect(plugin.filterUnpublished!.options?.enforce).toBe("post");
  });

  it("sets fatal: true", () => {
    expect(plugin.filterUnpublished!.options?.fatal).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { PluginContext } from "@svartz/core";
import remarkGfm from "remark-gfm";
import { transformGfm } from "../src/transform-gfm";

function makeCtx(): PluginContext {
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
    files: [],
    artifacts: new Map(),
    meta: new Map(),
  } as PluginContext;
}

describe("transformGfm", () => {
  it("registers remark-gfm for artifact compilation", () => {
    const ctx = makeCtx();

    transformGfm().transformGfm!.run(ctx);

    expect(ctx.meta.get("svartz:mdsvex:remarkPlugins")).toEqual([remarkGfm]);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, parse } from "svelte/compiler";
import { expect, it } from "vitest";
import type { Index, PluginContext, ResolvedConfig } from "@svartz/core";
import { emitArtifacts } from "../src/emit-artifacts";

it("executes Svelte only in .svx notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "svartz-note-formats-"));
  try {
    const ctx: PluginContext = {
      config: { outDir: join(root, "dist") } as ResolvedConfig,
      files: [
        {
          path: "plain.md",
          slug: "plain",
          extension: ".md",
          content: "# Plain\n\n<script>let count = 1;</script>\n\n<Counter />\n\n{count + 1}",
        },
        {
          path: "interactive.svx",
          slug: "interactive",
          extension: ".svx",
          content: "<script>let count = 1;</script>\n\n<button>{count + 1}</button>",
        },
      ],
      index: {
        version: "1.0.0", entries: [], graph: {}, backlinks: {}, search: [],
        tags: [], folders: [], routes: { notes: [], tags: [], folders: [], all: [] }, assets: [],
      } as unknown as Index,
      artifacts: new Map(),
      meta: new Map(),
    };
    await emitArtifacts().emitArtifacts!.run(ctx);

    const plainSource = String(ctx.artifacts.get("pages/plain.svelte")?.contents);
    const interactiveSource = String(ctx.artifacts.get("pages/interactive.svelte")?.contents);
    const plain = parse(plainSource, { modern: true });
    const interactive = parse(interactiveSource, { modern: true });

    expect(plain.instance).toBeDefined();
    expect(plainSource).toContain("let { contentComponents }");
    expect(plainSource).not.toContain("<script>let count");
    expect(plainSource).toContain("&#123;count + 1&#125;");
    expect(interactive.instance).toBeDefined();
    expect(interactive.fragment.nodes.some((node) => node.type === "RegularElement")).toBe(true);
    expect(() => compile(plainSource, { generate: "server" })).not.toThrow();
    expect(() => compile(interactiveSource, { generate: "server" })).not.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

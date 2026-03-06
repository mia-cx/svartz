import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { Index, PluginContext, ProcessedFile } from "@svartz/core";
import { emitArtifacts } from "../src/emit-artifacts";

const tempDirs: string[] = [];

function makeCtx(
  files: ProcessedFile[],
  index: Index,
  outDir: string,
): PluginContext {
  return {
    config: {
      version: "0.0.1",
      id: "docs",
      path: "/vault",
      outDir,
      include: [],
      exclude: [],
      linkResolution: "closest",
      theme: { base: "@svartz/theme-test" },
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
    index,
    meta: new Map(),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("core:emit-artifacts", () => {
  it("emits note page modules and an eager index module", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "svartz-emit-"));
    tempDirs.push(tempRoot);

    const outDir = join(tempRoot, "dist");
    const ctx = makeCtx(
      [
        {
          path: "guides/intro.md",
          slug: "guides/intro",
          content: "# Intro\n\nWelcome to Svartz.",
          frontmatter: { title: "Intro" },
        },
      ],
      {
        version: "1.0.0",
        entries: [
          {
            slug: "guides/intro",
            path: "guides/intro.md",
            title: "Intro",
            tags: [],
            aliases: [],
            description: "Welcome to Svartz.",
            links: [],
            wordCount: 3,
            readingTimeMinutes: 1,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            modifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        graph: { "guides/intro": [] },
        backlinks: { "guides/intro": [] },
      },
      outDir,
    );

    await emitArtifacts().emitArtifacts!.run(ctx);

    const artifactsRoot = resolve(outDir, "..", "artifacts");
    const pagePath = join(artifactsRoot, "pages/guides/intro.svelte");
    const indexPath = join(artifactsRoot, "index.ts");

    expect(ctx.artifacts.has("pages/guides/intro.svelte")).toBe(true);
    expect(ctx.artifacts.has("index.ts")).toBe(true);

    const [pageModule, indexModule] = await Promise.all([
      readFile(pagePath, "utf-8"),
      readFile(indexPath, "utf-8"),
    ]);

    expect(pageModule).toContain("export const svartz");
    expect(pageModule).toContain("Welcome to Svartz.");
    expect(indexModule).toContain("export const index =");
    expect(indexModule).toContain("export const graph = index.graph;");
  });
});

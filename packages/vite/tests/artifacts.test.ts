import { describe, expect, it } from "vitest";
import type { Artifact, ResolvedConfig } from "@svartz/core";
import {
  createArtifactsVirtualModuleSource,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedSearchModulePath,
} from "../src/artifacts";

const configA: ResolvedConfig = {
  version: "0.0.1",
  id: "docs",
  path: "/vaults/docs",
  outDir: "/workspace/.svartz/vaults/docs/dist",
  include: [],
  exclude: [],
  linkResolution: "closest",
  theme: { base: "@svartz/theme-docs" },
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
};

const configB: ResolvedConfig = {
  ...configA,
  id: "notes",
  path: "/vaults/notes",
  outDir: "/workspace/.svartz/vaults/notes/dist",
};

describe("@svartz/vite artifact helpers", () => {
  it("derives vault-scoped artifact roots from outDir", () => {
    expect(getGeneratedArtifactsRoot(configA)).toBe(
      "/workspace/.svartz/vaults/docs/artifacts",
    );
    expect(getGeneratedArtifactsRoot(configB)).toBe(
      "/workspace/.svartz/vaults/notes/artifacts",
    );
    expect(getGeneratedArtifactsRoot(configA)).not.toBe(
      getGeneratedArtifactsRoot(configB),
    );
  });

  it("derives note page paths from the generated pages root", () => {
    expect(getGeneratedPageModulePath(configA, "guides/intro.svelte")).toBe(
      "/workspace/.svartz/vaults/docs/artifacts/pages/guides/intro.svelte",
    );
  });

  it("builds a lazy artifact bridge source with eager index re-exports", () => {
    const artifacts: Artifact[] = [
      {
        key: "pages/guides/intro.svelte",
        path: "/workspace/.svartz/vaults/docs/artifacts/pages/guides/intro.svelte",
        type: "svelte",
        pluginId: "core:emit-artifacts",
        noteSlug: "guides/intro",
        contents: "<h1>Intro</h1>",
      },
      {
        key: "index.ts",
        path: "/workspace/.svartz/vaults/docs/artifacts/index.ts",
        type: "ts",
        pluginId: "core:emit-artifacts",
        contents: "export const index = {};",
      },
    ];

    const source = createArtifactsVirtualModuleSource(
      artifacts,
      getGeneratedIndexModulePath(configA),
      getGeneratedSearchModulePath(configA),
    );

    expect(source).toContain(
      'import { index, graph, backlinks, search, tags, folders, routes, assets } from "/workspace/.svartz/vaults/docs/artifacts/index.ts";',
    );
    expect(source).toContain(
      'import { searchDocuments, searchIndex } from "/workspace/.svartz/vaults/docs/artifacts/search.ts";',
    );
    expect(source).toContain('"pages/guides/intro.svelte": () => import("/workspace/.svartz/vaults/docs/artifacts/pages/guides/intro.svelte")');
    expect(source).toContain("export const artifacts = new Map");
  });
});

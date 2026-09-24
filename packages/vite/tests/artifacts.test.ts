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

  it("builds an eager artifact bridge source for SSR", () => {
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
    expect(source).toContain(
      'import * as noteArtifact0 from "/workspace/.svartz/vaults/docs/artifacts/pages/guides/intro.svelte";',
    );
    expect(source).toContain(
      '"pages/guides/intro.svelte": noteArtifact0',
    );
    expect(source).toContain('export const siteConfig = {"title":"Svartz"};');
    expect(source).toContain("export function hasNoteArtifact(key)");
    expect(source).toContain("export function getNoteArtifact(key)");
    expect(source).not.toContain("() => import(");
    expect(source).not.toContain("async function getNoteArtifact");
    expect(source).toContain("export const artifacts = new Map");
  });

  it("imports only resources contributed by the current build", () => {
    const source = createArtifactsVirtualModuleSource(
      [],
      "/out/index.ts",
      "/out/search.ts",
      {},
      { title: "Test" },
      [
        { id: "math-css", kind: "css", importId: "/plugins/katex.min.css" },
        { id: "diagram-script", kind: "script", importId: "/plugins/diagram.js" },
        { id: "icon", kind: "asset", importId: "/plugins/icon.svg" },
      ],
    );
    expect(source).toContain('import "/plugins/katex.min.css";');
    expect(source).toContain('if (!import.meta.env.SSR) void import("/plugins/diagram.js");');
    expect(source).toContain('import browserAsset2 from "/plugins/icon.svg";');
    expect(source).toContain('"icon": browserAsset2');

    const next = createArtifactsVirtualModuleSource([], "/out/index.ts", "/out/search.ts");
    expect(next).not.toContain("katex.min.css");
    expect(next).not.toContain("diagram.js");
  });
});

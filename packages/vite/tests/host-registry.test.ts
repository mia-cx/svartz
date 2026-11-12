import { describe, expect, it } from "vitest";
import { basename } from "node:path";
import type { ResolvedConfig } from "@svartz/core";
import { createHostIndexSource, createHostRegistrySource, deploymentBasePath, getGeneratedHostIndexPath, getGeneratedHostRegistryPath, getGeneratedHostStylesPath, svelteKitPaths } from "../src/host-registry";

const vault = (id: string, mountPath: string): ResolvedConfig => ({
  version: "1.0.0",
  id,
  path: `/workspace/${id}`,
  outDir: `/workspace/.svartz/vaults/${id}/dist`,
  mountPath,
  include: [],
  exclude: [],
  linkResolution: "closest",
  theme: { base: "@svartz/theme-minimal" },
  site: { title: id, url: "https://example.test" },
  frontmatter: {
    titleField: "title", descriptionField: "description", tagsField: "tags",
    aliasesField: "aliases", createdAtField: "created_at", updatedAtField: "updated_at",
    publishedField: "published_at",
  },
  target: { type: "host" },
  plugins: [],
});

describe("host registry", () => {
  it("imports route metadata eagerly and loads runtime code for only the prepared mount", () => {
    const source = createHostRegistrySource([vault("blog", "/blog"), vault("work", "/work")]);
    expect(source).toContain('import * as index0 from "/workspace/.svartz/vaults/blog/artifacts/index.ts"');
    expect(source).toContain('import * as index1 from "/workspace/.svartz/vaults/work/artifacts/index.ts"');
    expect(source).toContain('import("/workspace/.svartz/vaults/blog/artifacts/runtime-artifacts.ts")');
    expect(source).toContain('import("/workspace/.svartz/vaults/work/artifacts/runtime-theme.ts")');
    expect(source).toContain('import.meta.env.SSR ?');
    expect(source).toContain('return [...styles.shared, ...(key ? styles.notes[key] ?? [] : [])];');
    expect(source).not.toMatch(/import \* as (?:artifacts|theme)/);
    expect(source).toContain('mountPath: "/blog"');
    expect(source).toContain('mountPath: "/work"');
    expect(source).toContain('basePath: ""');
    expect(source).toContain("await theme.ready;");
    expect(source).toContain("await preparing.get(selected.id);");
    expect(source).toContain("const match = selected.theme.resolveRuntimeRoute({ pathname: vaultPathname, slug });");
    expect(source).toContain("await selected.artifacts.prepareNoteArtifact(key);");
    expect(getGeneratedHostRegistryPath("/workspace")).toBe("/workspace/.svartz/host/runtime.ts");
    expect(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "../../../package"))
      .toMatch(/^\/workspace\/\.svartz\/host\/styles\/[^/]+\.json$/);
    expect(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "aaa").toLowerCase())
      .not.toBe(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "aaG").toLowerCase());
    expect(Buffer.byteLength(basename(getGeneratedHostStylesPath("/workspace/.svartz/host/runtime.ts", "x".repeat(126)))))
      .toBeLessThanOrEqual(255);
  });

  it("publishes each vault's index without importing the page runtime or theme", () => {
    const source = createHostIndexSource([vault("blog", "/blog"), vault("work", "/work")], "/site");
    expect(source).toContain('import { index as index0 } from "/workspace/.svartz/vaults/blog/artifacts/index.ts"');
    expect(source).toContain('{ id: "work", mountPath: "/work", basePath: "/site", index: index1, siteConfig: {"title":"work","url":"https://example.test"} }');
    // Vite compiles dynamic imports too, so the entry must not name runtime modules at all.
    expect(source).not.toMatch(/import\(|runtime-|\$app\//);
    expect(getGeneratedHostIndexPath("/workspace")).toBe("/workspace/.svartz/host/index.ts");
  });

  it("uses the target or canonical host URL as the deployment base", () => {
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static", basePath: "/site" } })).toBe("/site");
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static" }, site: { title: "Docs", url: "https://example.test/site" } })).toBe("");
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } })).toBe("/site");
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } }]))
      .toContain('basePath: "/site"');
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), target: { type: "static", basePath: "/site" } }]))
      .toContain('basePath: "/site"');
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog" } }, "/site")).toBe("/site");
    const source = createHostRegistrySource([vault("blog", "/site/docs")], { base: "/site", assets: "/site" });
    expect(source).toContain('basePath: "/site"');
    expect(source).toContain("return pathname === mountPath || pathname.startsWith(`${mountPath}/`);");
    expect(source).not.toContain("pathname.slice(basePath.length)");
  });

  it("exports SvelteKit's base and assets, which SvelteKit 3's $app/paths dropped", () => {
    const define = { __SVELTEKIT_PATHS_BASE__: '"/site"', __SVELTEKIT_PATHS_ASSETS__: '""' };
    expect(svelteKitPaths(define)).toEqual({ base: "/site", assets: "/site" });
    expect(svelteKitPaths({ ...define, __SVELTEKIT_PATHS_ASSETS__: '"https://cdn.example.test"' }))
      .toEqual({ base: "/site", assets: "https://cdn.example.test" });
    expect(svelteKitPaths({})).toBeUndefined();
    const source = createHostRegistrySource([vault("blog", "/blog")], { base: "/site", assets: "https://cdn.example.test" });
    expect(source).toContain('export const base = "/site";');
    expect(source).toContain('export const assets = "https://cdn.example.test";');
  });
});

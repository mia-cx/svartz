import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "@svartz/core";
import { createHostRegistrySource, deploymentBasePath, getGeneratedHostRegistryPath, svelteKitBasePath } from "../src/host-registry";

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
    expect(source).toContain('return selected ? runtimeStyles[vaults.indexOf(selected)] ?? [] : [];');
    expect(source).not.toMatch(/import \* as (?:artifacts|theme)/);
    expect(source).toContain('mountPath: "/blog"');
    expect(source).toContain('mountPath: "/work"');
    expect(source).toContain('basePath: ""');
    expect(source).toContain("await theme.ready;");
    expect(source).toContain("await preparing.get(selected.id);");
    expect(getGeneratedHostRegistryPath("/workspace")).toBe("/workspace/.svartz/host/runtime.ts");
  });

  it("uses the target or canonical host URL as the deployment base", () => {
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static", basePath: "/site" } })).toBe("/site");
    expect(deploymentBasePath({ ...vault("docs", ""), target: { type: "static" }, site: { title: "Docs", url: "https://example.test/site" } })).toBe("");
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } })).toBe("/site");
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), site: { title: "Blog", url: "https://example.test/site" } }]))
      .toContain('basePath: "/site"');
    expect(createHostRegistrySource([{ ...vault("blog", "/blog"), target: { type: "static", basePath: "/site" } }]))
      .toContain('basePath: "/site"');
    expect(svelteKitBasePath({ __SVELTEKIT_PATHS_BASE__: '"/site"' })).toBe("/site");
    expect(deploymentBasePath({ ...vault("blog", "/blog"), site: { title: "Blog" } }, "/site")).toBe("/site");
    const source = createHostRegistrySource([vault("blog", "/site/docs")], "/site");
    expect(source).toContain('basePath: "/site"');
    expect(source).toContain("return pathname === mountPath || pathname.startsWith(`${mountPath}/`);");
    expect(source).not.toContain("pathname.slice(basePath.length)");
  });
});

import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "@svartz/core";
import { createHostRegistrySource, getGeneratedHostRegistryPath } from "../src/host-registry";

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
  frontmatter: {
    titleField: "title", descriptionField: "description", tagsField: "tags",
    aliasesField: "aliases", createdAtField: "created_at", updatedAtField: "updated_at",
    publishedField: "published_at",
  },
  target: { type: "host" },
  plugins: [],
});

describe("host registry", () => {
  it("keeps theme and artifact imports separate for each mount", () => {
    const source = createHostRegistrySource([vault("blog", "/blog"), vault("work", "/work")]);
    expect(source).toContain('import * as artifacts0 from "/workspace/.svartz/vaults/blog/artifacts/runtime-artifacts.ts"');
    expect(source).toContain('import * as artifacts1 from "/workspace/.svartz/vaults/work/artifacts/runtime-artifacts.ts"');
    expect(source).toContain('import * as theme1 from "/workspace/.svartz/vaults/work/artifacts/runtime-theme.ts"');
    expect(source).toContain('mountPath: "/blog"');
    expect(source).toContain('mountPath: "/work"');
    expect(getGeneratedHostRegistryPath("/workspace")).toBe("/workspace/.svartz/host/runtime.ts");
  });
});

import { describe, expect, it } from "vitest";
import type { ResolvedBuildDefaults, ResolvedVaultConfig } from "@svartz/config";
import { mapResolvedVaultToIndexOptions } from "../src/config-adapter.js";

describe("mapResolvedVaultToIndexOptions", () => {
  it("maps resolved config vault and build defaults to vault options", () => {
    const vault: ResolvedVaultConfig = {
      id: "docs",
      path: "/tmp/docs",
      include: ["content/**/*.md"],
      exclude: ["content/private/**"],
      linkResolution: "shallowest",
      theme: {
        base: "@svartz/theme-minimal",
        config: {},
      },
      frontmatter: {
        titleField: "name",
        descriptionField: "summary",
        tagsField: "labels",
        aliasesField: "aka",
        createdAtField: "created",
        updatedAtField: "updated",
        publishedField: "published",
      },
      rootPath: "/",
      target: { type: "static" },
    };

    const buildDefaults: ResolvedBuildDefaults = {
      concurrency: 7,
      maxRetries: 4,
    };

    const mapped = mapResolvedVaultToIndexOptions(vault, buildDefaults);

    expect(mapped.vaultPath).toBe("/tmp/docs");
    expect(mapped.traverseOptions).toEqual({
      include: ["content/**/*.md"],
      exclude: ["content/private/**"],
    });
    expect(mapped.buildOptions).toMatchObject({
      titleField: "name",
      descriptionField: "summary",
      tagsField: "labels",
      aliasesField: "aka",
      createdAtField: "created",
      updatedAtField: "updated",
      publishedField: "published",
      linkResolution: "shallowest",
      concurrency: 7,
      maxRetries: 4,
      vaultPath: "/tmp/docs",
      include: ["content/**/*.md"],
      exclude: ["content/private/**"],
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "@svartz/core";
import { createVaultChangeEvent } from "../src/watch";

const testConfig: ResolvedConfig = {
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

describe("@svartz/vite watch helpers", () => {
  it("classifies vault-local paths into change events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));

    expect(createVaultChangeEvent(testConfig, "change", "/vaults/docs/guides/intro.md")).toEqual(
      expect.objectContaining({
        type: "change",
        file: "/vaults/docs/guides/intro.md",
        absoluteFile: "/vaults/docs/guides/intro.md",
        relativeFile: "guides/intro.md",
        timestamp: new Date("2026-03-07T12:00:00.000Z").valueOf(),
      }),
    );
  });

  it("ignores files outside the active vault", () => {
    expect(createVaultChangeEvent(testConfig, "change", "/workspace/apps/web/vite.config.ts")).toBeUndefined();
  });
});

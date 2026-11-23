import { expect, it } from "vitest";
import type { PluginContext, ResolvedConfig } from "@svartz/core";
import { transformDescription } from "../src/transform-description";

const titlesOf = (paths: string[], frontmatter: Record<string, unknown> = {}) => {
  const files = paths.map((path) => ({ path, extension: ".md", content: "Body.", frontmatter: { ...frontmatter } }));
  const ctx = {
    config: { frontmatter: { titleField: "title", descriptionField: "description" } } as ResolvedConfig,
    files,
    meta: new Map(),
  } as unknown as PluginContext;
  transformDescription().transformDescription!.run(ctx);
  return files.map((file) => file.frontmatter.title);
};

it("titles a folder note after its folder and other notes after their filename", () => {
  expect(titlesOf(["Guides/index.md", "Work/Tastebase/_index.md", "Guides/Setup Notes.md", "index.md"])).toEqual([
    "Guides",
    "Tastebase",
    "Setup Notes",
    "index",
  ]);
});

it("keeps a folder note's own title", () => {
  expect(titlesOf(["Guides/index.md"], { title: "Field guides" })).toEqual(["Field guides"]);
});

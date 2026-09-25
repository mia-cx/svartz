import { expect, it } from "vitest";
import type { DateSource, PluginContext, ResolvedConfig } from "@svartz/core";
import { indexContent } from "../src/index-content";

function context(dateSources: DateSource[]): PluginContext {
  return {
    config: {
      id: "notes",
      mountPath: "",
      frontmatter: {
        titleField: "title", tagsField: "tags", aliasesField: "aliases",
        descriptionField: "description", createdAtField: "created_at",
        updatedAtField: "updated_at", publishedField: "published_at",
      },
      discovery: { dateSources },
      theme: { base: "minimal" },
    } as ResolvedConfig,
    files: [{
      path: "note.md", slug: "note", extension: ".md", content: "# Note",
      frontmatter: {
        title: "Note", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-02-01T00:00:00Z",
        published_at: "2030-01-01T00:00:00Z",
      },
      gitCreatedAt: new Date("2021-01-01"), gitModifiedAt: new Date("2022-01-01"),
      createdAt: new Date("2023-01-01"), modifiedAt: new Date("2024-01-01"),
    }],
    meta: new Map(),
  } as unknown as PluginContext;
}

it("uses configured date precedence and keeps published_at independent", () => {
  const ctx = context(["git", "frontmatter", "filesystem"]);

  indexContent().indexContent!.run(ctx);
  expect(ctx.index?.entries[0]?.createdAt.toISOString()).toBe("2021-01-01T00:00:00.000Z");
  expect(ctx.index?.entries[0]?.modifiedAt.toISOString()).toBe("2022-01-01T00:00:00.000Z");
  expect(ctx.index?.entries[0]?.publishedAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");

  const frontmatterFirst = context(["frontmatter", "filesystem"]);
  indexContent().indexContent!.run(frontmatterFirst);
  expect(frontmatterFirst.index?.entries[0]?.createdAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  expect(frontmatterFirst.index?.entries[0]?.modifiedAt.toISOString()).toBe("2020-02-01T00:00:00.000Z");
});

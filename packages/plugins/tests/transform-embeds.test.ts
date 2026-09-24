import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { transformEmbeds } from "../src/transform-embeds";

const note = (path: string, content: string): ProcessedFile => ({
  path,
  slug: path.replace(/\.md$/, ""),
  extension: ".md",
  content,
  frontmatter: {},
});

const context = (files: ProcessedFile[]): PluginContext =>
  ({
    config: {
      frontmatter: { aliasesField: "aliases", titleField: "title" },
      linkResolution: "shortest",
      theme: {},
    },
    files,
    meta: new Map(),
  }) as unknown as PluginContext;

describe("note embeds", () => {
  it("transcludes a section as Markdown, with links resolved and callouts marked", () => {
    const source = note("guide/setup.md", "Before.\n\n![[sensors#Humidity]]\n\nAfter.");
    const target = note(
      "hardware/sensors.md",
      "## Humidity\n\nSee [[dew-point|dew point]] and [[missing]].\n\n> [!warning] Wet\n> Dries slowly.\n\n## Pressure\n\nNot embedded.",
    );
    const files = [source, target, note("software/dew-point.md", "Dew.")];
    transformEmbeds().transformEmbeds!.run(context(files));

    expect(source.content).toMatch(/svartz-embed-source.*<\/p>\n\n## Humidity/);
    expect(source.content).toMatch(/Dries slowly\.\n\n<\/div>/);
    expect(source.content).toContain('<a href="../../software/dew-point/">dew point</a>');
    expect(source.content).toContain("and missing.");
    expect(source.content).toContain('data-callout="warning"');
    expect(source.content).not.toContain("Not embedded");
  });
});

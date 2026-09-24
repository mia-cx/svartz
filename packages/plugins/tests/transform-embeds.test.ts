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

  it("leaves wikilinks in code alone and links attachments", () => {
    const source = note("guide.md", "![[sensors]]");
    const target = note("sensors.md", "Write `[[dew-point]]` to link. See [[diagram.svg|the diagram]].\n\n```md\n[[dew-point]]\n```");
    const diagram: ProcessedFile = { path: "attachments/diagram.svg", slug: "attachments/diagram.svg", extension: ".svg", content: "" };
    transformEmbeds().transformEmbeds!.run(context([source, target, note("dew-point.md", "Dew."), diagram]));

    expect(source.content).toContain("`[[dew-point]]`");
    expect(source.content).toContain("```md\n[[dew-point]]\n```");
    expect(source.content).toContain('<a href="../attachments/diagram.svg">the diagram</a>');
  });
});

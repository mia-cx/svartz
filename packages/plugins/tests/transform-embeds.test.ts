import { describe, expect, it } from "vitest";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { toHtml } from "hast-util-to-html";
import { renderMarkdownTree } from "../src/internal/render-markdown";
import { transformEmbeds } from "../src/transform-embeds";
import { transformOfm } from "../src/transform-ofm";

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
  describe.each([false, true])("code examples, transcluded: %s", (transcluded) => {
    it.each(["Ada", "diagram.png", "missing"])("publishes %s embeds verbatim in code, expanding only prose", async (target) => {
      const embed = `![[${target}]]`;
      const code = [
        `\`${embed}\``,
        `\`\`literal \` ${embed}\`\``,
        `\`\`\`\n${embed}\n\`\`\``,
        `~~~\n${embed}\n~~~`,
        `    ${embed}`,
      ].join("\n\n");
      const body = `${embed}\n\n${code}\n\n${embed}`;
      const source = note("guide.md", transcluded ? "![[examples]]" : body);
      const files = [source, note("Ada.md", "Ada's body."), {
        path: "diagram.png", slug: "diagram.png", extension: ".png", content: "",
      }];
      if (transcluded) files.push(note("examples.md", body));
      const ctx = context(files);
      ctx.meta.set("sourceBodies", new Map(files.map((file) => [file.path, file.content])));
      transformOfm().transformOfm!.run(ctx);
      transformEmbeds().transformEmbeds!.run(ctx);

      expect(source.content).toContain(code);
      const html = toHtml(await renderMarkdownTree(ctx, source.content));
      expect(html).toContain(`<code>${embed}</code>`);
      expect(html).toContain(`<code>literal \` ${embed}</code>`);
      expect(html.split(`<pre><code>${embed}\n</code></pre>`)).toHaveLength(4);
      if (target === "Ada") {
        expect(html.match(/data-embed="Ada"/g)).toHaveLength(2);
        expect(html).toContain("Ada's body.");
      } else if (target === "diagram.png") {
        expect(html.match(/<img src="\.\.\/diagram.png"/g)).toHaveLength(2);
      } else {
        expect(html.match(/<p>missing<\/p>/g)).toHaveLength(2);
      }
    });
  });

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

  it("resolves an embed by physical basename when frontmatter slugs change the URLs", () => {
    const alpha = note("a/Setup Notes.md", "Alpha body.");
    alpha.frontmatter = { slug: "alpha" };
    alpha.slug = "a/alpha";
    const beta = note("b/Setup Notes.md", "Beta body.");
    beta.frontmatter = { slug: "beta" };
    beta.slug = "b/beta";
    const host = note("a/host.md", "![[Setup Notes]]");
    const ctx = context([host, alpha, beta]);
    ctx.config.linkResolution = "closest";
    transformEmbeds().transformEmbeds!.run(ctx);

    expect(host.content).toContain('data-embed="a/alpha"');
    expect(host.content).toContain("Alpha body.");
    expect(host.content).not.toContain("Beta body.");
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

  it("leaves escaped wikilinks and raw HTML attributes alone", () => {
    const source = note("guide.md", "![[sensors]]");
    const target = note("sensors.md", 'Type \\[[dew-point]] to link.\n\n<span title="[[dew-point]]">hover</span>');
    transformEmbeds().transformEmbeds!.run(context([source, target, note("dew-point.md", "Dew.")]));

    expect(source.content).toContain("\\[[dew-point]]");
    expect(source.content).toContain('<span title="[[dew-point]]">hover</span>');
    expect(source.content).not.toContain('href="dew-point/"');
  });
});

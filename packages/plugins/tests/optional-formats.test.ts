import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext, ResolvedConfig } from "@svartz/core";
import { hardLineBreaks } from "../src/hard-line-breaks";
import { roamFlavoredMarkdown } from "../src/roam-flavored-markdown";
import { oxHugoFlavoredMarkdown } from "../src/oxhugo-flavored-markdown";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { renderMarkdown } from "../src/internal/render-markdown";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function context(path: string, content: string): PluginContext {
  return {
    config: { path } as ResolvedConfig,
    files: [{ path: "note.md", slug: "note", extension: ".md", content }],
    artifacts: new Map(),
    meta: new Map(),
  };
}

describe("optional content formats", () => {
  it("renders hard line breaks only when configured", async () => {
    const disabled = context("/vault", "first\nsecond");
    const enabled = context("/vault", "first\nsecond");
    hardLineBreaks().transformGfm!.run(enabled);
    expect(await renderMarkdown(disabled, disabled.files[0]!.content)).not.toContain("<br>");
    expect(await renderMarkdown(enabled, enabled.files[0]!.content)).toContain("<br>");
  });

  it("renders Roam controls, media, quotes, highlights, and underscore italics", async () => {
    const markdown = [
      "__italic__ **bold** ^^highlight^^ {{[[TODO]]}} {{[[DONE]]}} {{or:yes|no}}",
      "",
      "[[>]] A quote",
      "",
      "{{[[video]]: https://youtu.be/abc123}}",
      "",
      "`{{[[TODO]]}}`",
    ].join("\n");
    const ctx = context("/vault", markdown);
    roamFlavoredMarkdown().transformGfm!.run(ctx);
    const html = await renderMarkdown(ctx, markdown);
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<span class="text-highlight">highlight</span>');
    expect(html).toContain('<input type="checkbox" disabled>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
    expect(html).toContain('<select><option value="yes">yes</option><option value="no">no</option></select>');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("https://www.youtube.com/embed/abc123");
    expect(html).toContain("<code>{{[[TODO]]}}</code>");
  });

  it("lets Roam options disable controls and rejects executable media URLs", async () => {
    const markdown = '{{or:a" onclick="alert(1)|safe}} {{[[TODO]]}}\n\n{{[[video]]: javascript:alert(1)}}';
    const ctx = context("/vault", markdown);
    roamFlavoredMarkdown({ TODOComponent: false }).transformGfm!.run(ctx);
    const html = await renderMarkdown(ctx, markdown);
    expect(html).toContain('value="a&#x22; onclick=&#x22;alert(1)"');
    expect(html).toContain("{{[[TODO]]}}");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
  });

  it("normalizes ox-hugo prose before frontmatter and link extraction", () => {
    const markdown = [
      "---", "private: false", "---",
      '[Hello]({{< relref "hello.md" >}})',
      "# Heading {#old-anchor}",
      '<figure src="photo.png">', "",
      "\\(x\\_1\\)",
      "\\[y\\]",
      "```md", '[Keep]({{< relref "code.md" >}})', "```",
    ].join("\n");
    const ctx = context("/vault", markdown);
    oxHugoFlavoredMarkdown().parseFrontmatter!.run(ctx);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    expect(ctx.files[0]!.frontmatter).toEqual({ private: false });
    expect(ctx.files[0]!.rawLinks?.map((link) => link.target)).toEqual(["hello.md"]);
    expect(ctx.files[0]!.content).toContain("# Heading\n![](photo.png)\n\n$x_1$\n$$y$$");
    expect(ctx.files[0]!.content).toContain('[Keep]({{< relref "code.md" >}})');

    const disabled = context("/vault", markdown);
    oxHugoFlavoredMarkdown({ wikilinks: false, removeHugoShortcode: false }).parseFrontmatter!.run(disabled);
    expect(disabled.files[0]!.content).toContain('[Hello]({{< relref "hello.md" >}})');
  });
});

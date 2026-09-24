import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext, ResolvedConfig } from "@svartz/core";
import { hardLineBreaks } from "../src/hard-line-breaks";
import { roamFlavoredMarkdown } from "../src/roam-flavored-markdown";
import { oxHugoFlavoredMarkdown } from "../src/oxhugo-flavored-markdown";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { resolveLinks } from "../src/resolve-links";
import { citations } from "../src/citations";
import { compileProtectedNoteSource } from "../src/emit-artifacts";
import { renderMarkdown } from "../src/internal/render-markdown";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function context(path: string, content: string): PluginContext {
  return {
    config: {
      path, publicationMode: "exclusion", include: [], exclude: [], mountPath: "",
      linkResolution: "closest",
      frontmatter: { publishedField: "published_at", aliasesField: "aliases" },
      passwordGroups: {},
    } as unknown as ResolvedConfig,
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
    expect(html).toContain('<input type="checkbox" aria-label="To do" disabled>');
    expect(html).toContain('<input type="checkbox" aria-label="Done" checked disabled>');
    expect(html).toContain('<select aria-label="Choose an option"><option value="yes">yes</option><option value="no">no</option></select>');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("https://www.youtube.com/embed/abc123");
    expect(html).toContain("<code>{{[[TODO]]}}</code>");

    const protectedNote = context("/vault", "__italic__ {{or:yes|no}} {{[[TODO]]}}\n\n[[>]] A quote\n\n{{[[video]]: https://youtu.be/abc123}}");
    protectedNote.files[0]!.extension = ".svx";
    protectedNote.files[0]!.protection = { group: "team", hidden: false };
    roamFlavoredMarkdown().transformGfm!.run(protectedNote);
    const protectedSource = await compileProtectedNoteSource(protectedNote, protectedNote.files[0]!);
    expect(protectedSource).toContain('<select aria-label="Choose an option">');
    expect(protectedSource).toContain("<em>italic</em>");
    expect(protectedSource).toContain('type="checkbox"');
    expect(protectedSource).toContain("<blockquote>");
    expect(protectedSource).toContain("https://www.youtube.com/embed/abc123");
  });

  it("keeps Roam markers out of link rewriting and retains local media", async () => {
    const ctx = context("/vault", "{{[[TODO]]}} [[TODO]]\n\n[[>]] A quote\n\n{{[[audio]]: media/clip.mp3}}");
    ctx.files.push(
      { path: "TODO.md", slug: "TODO", extension: ".md", content: "# Linked note" },
      { path: "media/clip.mp3", slug: "media/clip.mp3", extension: ".mp3", content: "", sourcePath: "/vault/media/clip.mp3" },
      { path: "private.md", slug: "private", extension: ".md", content: "---\nprivate: true\n---\n{{[[audio]]: media/secret.mp3}}" },
      { path: "media/secret.mp3", slug: "media/secret.mp3", extension: ".mp3", content: "", sourcePath: "/vault/media/secret.mp3" },
    );
    const roam = roamFlavoredMarkdown();
    parseFrontmatter().parseFrontmatter!.run(ctx);
    roam.parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    roam.transformGfm!.run(ctx);

    expect(ctx.files.map((file) => file.path)).toContain("media/clip.mp3");
    expect(ctx.files.map((file) => file.path)).not.toContain("media/secret.mp3");
    expect(ctx.files[0]!.rawLinks?.map((link) => link.target)).toEqual(["TODO"]);
    expect(ctx.files[0]!.links).toEqual(["TODO"]);
    expect(ctx.files[0]!.content).toContain("{{[[TODO]]}}");
    expect(ctx.files[0]!.content).toContain("{{[[audio]]: ../media/clip.mp3}}");
    const html = await renderMarkdown(ctx, ctx.files[0]!.content);
    expect(html).toContain('<input type="checkbox" aria-label="To do" disabled>');
    expect(html).toContain("<blockquote>");
    expect(html).toContain('<audio controls src="../media/clip.mp3"></audio>');
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

  it("parses TOML privacy metadata before filtering and leaves SVX source intact", () => {
    const ctx = context("/vault", "+++\nprivate = true\npublished_at = 2026-01-01\n+++\n# Secret");
    oxHugoFlavoredMarkdown().parseFrontmatter!.run(ctx);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files).toEqual([]);

    const malformed = context("/vault", "+++\nprivate = true\n# Secret");
    expect(() => parseFrontmatter().parseFrontmatter!.run(malformed)).toThrow(/frontmatter/i);

    const svx = context("/vault", '<script>const link = "[Hello]({{< relref \\"hello.md\\" >}})";</script>\n{link}');
    svx.files[0]!.extension = ".svx";
    const original = svx.files[0]!.content;
    oxHugoFlavoredMarkdown().parseFrontmatter!.run(svx);
    expect(svx.files[0]!.content).toBe(original);
  });

  it("renders citations from a vault-local bibliography", async () => {
    const root = await mkdtemp(join(tmpdir(), "svartz-citations-"));
    roots.push(root);
    await writeFile(join(root, "bibliography.bib"), [
      "@article{doe2020,",
      "  author = {Doe, Jane},",
      "  title = {A Published Example},",
      "  journal = {Example Journal},",
      "  year = {2020}",
      "}",
      "@article{private2021,",
      "  author = {Private, Pat},",
      "  title = {Unpublished Vault Detail},",
      "  year = {2021}",
      "}",
    ].join("\n"));
    const markdown = "Research [@doe2020].";
    const disabled = context(root, markdown);
    expect(await renderMarkdown(disabled, markdown)).toContain("[@doe2020]");

    const enabled = context(root, markdown);
    citations({ bibliographyFile: "bibliography.bib", linkCitations: true }).transformGfm!.run(enabled);
    const html = await renderMarkdown(enabled, markdown);
    expect(html).toContain("Doe");
    expect(html).toContain("2020");
    expect(html).toContain("A Published Example");
    expect(html).toContain("data-no-popover");
    expect(html).not.toContain("Unpublished Vault Detail");

    const protectedNote = context(root, markdown);
    protectedNote.files[0]!.extension = ".svx";
    protectedNote.files[0]!.protection = { group: "team", hidden: false };
    citations({ bibliographyFile: "bibliography.bib" }).transformGfm!.run(protectedNote);
    const protectedSource = await compileProtectedNoteSource(protectedNote, protectedNote.files[0]!);
    expect(protectedSource).toContain("A Published Example");
    expect(protectedSource).not.toContain("Unpublished Vault Detail");

    const suppressed = context(root, markdown);
    citations({ suppressBibliography: true }).transformGfm!.run(suppressed);
    expect(await renderMarkdown(suppressed, markdown)).not.toContain("A Published Example");
  });

  it("fails clearly when a configured citation bibliography is missing", () => {
    const ctx = context("/missing-vault", "Research [@doe2020]");
    expect(() => citations().transformGfm!.run(ctx)).toThrow("Citation bibliography not found");
  });
});

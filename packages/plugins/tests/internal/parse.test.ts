import { describe, it, expect } from "vitest";
import {
  extractFrontmatter,
  extractRawLinks,
  extractDescription,
  countWords,
  extractHeadings,
  extractSectionMarkdown,
} from "../../src/internal/parse";

describe("extractFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const content = `---
title: Hello
tags: [a, b]
---
Body content here.`;

    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);
    expect(frontmatter?.title).toBe("Hello");
    expect(frontmatter?.tags).toEqual(["a", "b"]);
    expect(bodyMarkdown.trim()).toBe("Body content here.");
  });

  // Proves each parse of the same note answers its own frontmatter: the pipeline writes derived values into it, and a
  // second build in the same process (a dev rebuild, a version identical to its note) must not read them as authored.
  it("answers fresh frontmatter on every parse of the same text", () => {
    const content = "---\ntitle: Hello\n---\nBody.";
    const first = extractFrontmatter(content).frontmatter!;
    first.description = "written by the build";

    expect(extractFrontmatter(content).frontmatter).toEqual({ title: "Hello" });
  });

  it("returns undefined frontmatter when none present", () => {
    const { frontmatter, bodyMarkdown } = extractFrontmatter("Just text.");
    expect(frontmatter).toBeUndefined();
    expect(bodyMarkdown.trim()).toBe("Just text.");
  });

  it("drops invalid frontmatter and keeps the body", () => {
    const content = `---
title: [
---
Body content here.`;

    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);
    expect(frontmatter).toBeUndefined();
    expect(bodyMarkdown.trim()).toBe("Body content here.");
  });

  it("sanitizes templater tags in frontmatter before parsing", () => {
    const content = `---
created: <% tp.file.creation_date() %>
title: Daily Note
---
Body content here.`;

    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);
    expect(frontmatter?.created).toBe("svartz-templater");
    expect(frontmatter?.title).toBe("Daily Note");
    expect(bodyMarkdown.trim()).toBe("Body content here.");
  });
});

describe("extractRawLinks", () => {
  it("extracts wikilinks", () => {
    const links = extractRawLinks("See [[My Page]] for details.");
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe("My Page");
    expect(links[0]!.type).toBe("wikilink");
  });

  it("extracts wikilinks with labels", () => {
    const links = extractRawLinks("See [[Target|Display Text]].");
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe("Target");
    expect(links[0]!.label).toBe("Display Text");
  });

  it("extracts wikilinks with sections", () => {
    const links = extractRawLinks("See [[Page#Section]].");
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe("Page");
    expect(links[0]!.section).toBe("Section");
  });

  it("extracts markdown links", () => {
    const links = extractRawLinks("See [text](path/to/page) here.");
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe("path/to/page");
    expect(links[0]!.type).toBe("markdown");
  });

  it("ignores external links", () => {
    const links = extractRawLinks(
      "See [ext](https://example.com) and [[https://foo.com]]",
    );
    expect(links).toHaveLength(0);
  });

  it("ignores image embeds", () => {
    const links = extractRawLinks("![alt](image.png)");
    expect(links).toHaveLength(0);
  });

  it("ignores links in code, comments, HTML, and escaped prose", () => {
    const markdown = [
      "[[real]] [real](real.md) `[[inline]] [inline](inline.md)`",
      "<!-- [[comment]] [comment](comment.md) -->",
      "<span>[[html]] [html](html.md)</span>",
      "\\[[escaped]]",
      "```md",
      "[[fenced]] [fenced](fenced.md)",
      "```",
    ].join("\n");
    expect(extractRawLinks(markdown).map((link) => link.target)).toEqual(["real", "real.md"]);
  });

  it("does not extract a wikilink inside an authored Markdown link", () => {
    expect(extractRawLinks("[[target]] [look [[nested]]](outer.md)").map((link) => link.target))
      .toEqual(["target", "outer.md"]);
  });
});

describe("heading extraction", () => {
  it("uses Setext headings and stable duplicate IDs while ignoring code", () => {
    const markdown = ["# Hello *world*", "Hello world", "===========", "```md", "# Fake", "```", "## Hello world"].join("\n");
    expect(extractHeadings(markdown)).toEqual([
      { depth: 1, text: "Hello world", slug: "hello-world" },
      { depth: 1, text: "Hello world", slug: "hello-world-1" },
      { depth: 2, text: "Hello world", slug: "hello-world-2" },
    ]);
    expect(extractSectionMarkdown(markdown, "hello-world-1")).toBe("Hello world\n===========\n```md\n# Fake\n```\n## Hello world");
  });
});

describe("extractDescription", () => {
  const sentence = "This sentence is padded out to make it roughly one hundred and twenty characters long, which is what the test needs. ";
  it.each([
    { name: "stops at the last whole sentence that fits", markdown: sentence.repeat(3), description: sentence.repeat(2).trim() },
    { name: "keeps a first sentence longer than the limit whole", markdown: `${"word ".repeat(80)}ends here. Next.`, description: `${"word ".repeat(80)}ends here.` },
    { name: "reads the first paragraph only", markdown: "First paragraph.\n\nSecond paragraph.", description: "First paragraph." },
    { name: "skips headings, code and embeds", markdown: "# Title\n\n```js\ncode\n```\n\n![[diagram.png]]\n\nSee [[guides/setup|the setup]] and [[faq]].", description: "See the setup and faq." },
    { name: "keeps inline code and hyphenated words", markdown: "Run `pnpm dev` for a well-known server.", description: "Run pnpm dev for a well-known server." },
    { name: "keeps a space at a hard break", markdown: "First line.  \nSecond line.\\\nThird line.", description: "First line. Second line. Third line." },
    { name: "gives a note that is only an embed none", markdown: "![[diagram.png]]", description: "" },
    { name: "falls back to a list when there is no paragraph", markdown: "- Only a list item.\n- Another.", description: "Only a list item." },
  ])("$name", ({ markdown, description }) => {
    expect(extractDescription(markdown)).toBe(description);
  });
});

describe("countWords", () => {
  it("counts words in plain text", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("strips markdown formatting", () => {
    expect(countWords("**bold** and _italic_")).toBe(3);
  });

  it("returns 0 for empty content", () => {
    expect(countWords("")).toBe(0);
  });
});

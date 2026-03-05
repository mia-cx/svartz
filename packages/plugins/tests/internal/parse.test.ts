import { describe, it, expect } from "vitest";
import {
  extractFrontmatter,
  extractRawLinks,
  extractDescription,
  countWords,
} from "../../src/internal/parse";

describe("extractFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const content = `---
title: Hello
tags: [a, b]
---
Body content here.`;

    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);
    expect(frontmatter.title).toBe("Hello");
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(bodyMarkdown.trim()).toBe("Body content here.");
  });

  it("returns empty frontmatter when none present", () => {
    const { frontmatter, bodyMarkdown } = extractFrontmatter("Just text.");
    expect(frontmatter).toEqual({});
    expect(bodyMarkdown.trim()).toBe("Just text.");
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
});

describe("extractDescription", () => {
  it("extracts first sentences", () => {
    const desc = extractDescription("First sentence. Second one. Third here.");
    expect(desc).toContain("First sentence.");
    expect(desc).toContain("Second one.");
  });

  it("strips headings and code blocks", () => {
    const desc = extractDescription(
      "# Title\n```js\ncode\n```\nActual content here.",
    );
    expect(desc).not.toContain("Title");
    expect(desc).not.toContain("code");
    expect(desc).toContain("Actual content here.");
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

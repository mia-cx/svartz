import { describe, it, expect } from "vitest";
import { Effect, Either } from "effect";
import { fileToSlug, deriveTitle, buildSlugMap } from "../src/utils/slug.js";
import {
  extractFrontmatter,
  extractRawLinks,
  extractExternalLinks,
  extractHeadings,
  extractDescription,
  countWords,
} from "../src/utils/parse.js";
import {
  shouldIgnore,
  shouldIncludePath,
  DEFAULT_IGNORES,
} from "../src/utils/ignore.js";
import { SlugConflict } from "../src/types.js";

const runSync = <A, E>(
  effect: Effect.Effect<A, E>,
): Either.Either<A, E> =>
  Effect.runSync(effect.pipe(Effect.either));

describe("fileToSlug", () => {
  it("strips .md extension", () => {
    expect(fileToSlug("note.md")).toBe("note");
  });

  it("preserves folder structure", () => {
    expect(fileToSlug("folder/note.md")).toBe("folder/note");
  });

  it("replaces spaces with hyphens", () => {
    expect(fileToSlug("My Note.md")).toBe("my-note");
  });

  it("replaces & with -and-", () => {
    expect(fileToSlug("A & B.md")).toBe("a--and--b");
  });

  it("replaces % with -percent", () => {
    expect(fileToSlug("100%.md")).toBe("100-percent");
  });

  it("removes ? and #", () => {
    expect(fileToSlug("FAQ?.md")).toBe("faq");
  });

  it("converts to lowercase", () => {
    expect(fileToSlug("MyNote.md")).toBe("mynote");
  });

  it("handles deeply nested paths", () => {
    expect(fileToSlug("a/b/c/deep note.md")).toBe("a/b/c/deep-note");
  });
});

describe("deriveTitle", () => {
  it("converts kebab-case to title case", () => {
    expect(deriveTitle("my-note")).toBe("My Note");
  });

  it("converts underscores to spaces", () => {
    expect(deriveTitle("my_note")).toBe("My Note");
  });
});

describe("buildSlugMap", () => {
  it("maps slugs to themselves", () => {
    const result = runSync(buildSlugMap([{ slug: "foo" }, { slug: "bar" }]));
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right["foo"]).toBe("foo");
      expect(result.right["bar"]).toBe("bar");
    }
  });

  it("maps aliases to canonical slug", () => {
    const result = runSync(
      buildSlugMap([{ slug: "note-one", aliases: ["first"] }]),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right["first"]).toBe("note-one");
    }
  });

  it("maps basename for nested slugs", () => {
    const result = runSync(buildSlugMap([{ slug: "folder/note" }]));
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right["note"]).toBe("folder/note");
    }
  });

  it("omits ambiguous aliases from map when same alias on multiple slugs", () => {
    const result = runSync(
      buildSlugMap([
        { slug: "a", aliases: ["conflict"] },
        { slug: "b", aliases: ["conflict"] },
      ]),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const map = result.right;
      expect(map["a"]).toBe("a");
      expect(map["b"]).toBe("b");
      expect(map["conflict"]).toBeUndefined();
    }
  });

  it("fails with SlugConflict on duplicate canonical slugs", () => {
    const result = runSync(
      buildSlugMap([{ slug: "same" }, { slug: "same" }]),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("SlugConflict");
    }
  });

  it("allows root and nested files with the same basename", () => {
    const result = runSync(
      buildSlugMap([
        { slug: "projects/svartz-site" },
        { slug: "svartz-site" },
      ]),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right["projects/svartz-site"]).toBe(
        "projects/svartz-site",
      );
      expect(result.right["svartz-site"]).toBe("svartz-site");
    }
  });

  it("drops ambiguous basename shortcuts when two nested files share a name", () => {
    const result = runSync(
      buildSlugMap([
        { slug: "folder-a/note" },
        { slug: "folder-b/note" },
      ]),
    );
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right["folder-a/note"]).toBe("folder-a/note");
      expect(result.right["folder-b/note"]).toBe("folder-b/note");
      expect(result.right["note"]).toBeUndefined();
    }
  });
});

describe("extractFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const content = "---\ntitle: Hello\ntags:\n  - a\n---\nBody text";
    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);

    expect(frontmatter["title"]).toBe("Hello");
    expect(frontmatter["tags"]).toEqual(["a"]);
    expect(bodyMarkdown.trim()).toBe("Body text");
  });

  it("handles no frontmatter", () => {
    const content = "Just some text";
    const { frontmatter, bodyMarkdown } = extractFrontmatter(content);

    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(bodyMarkdown.trim()).toBe("Just some text");
  });
});

describe("extractRawLinks", () => {
  it("finds wikilinks", () => {
    const links = extractRawLinks("See [[Page One]] and [[Page Two]]");
    expect(links).toHaveLength(2);
    expect(links[0]!.type).toBe("wikilink");
    expect(links[0]!.target).toBe("Page One");
    expect(links[1]!.target).toBe("Page Two");
  });

  it("parses wikilink labels", () => {
    const links = extractRawLinks("Visit [[Page|my label]]");
    expect(links[0]!.target).toBe("Page");
    expect(links[0]!.label).toBe("my label");
  });

  it("parses wikilink sections", () => {
    const links = extractRawLinks("See [[Page#section]]");
    expect(links[0]!.target).toBe("Page");
    expect(links[0]!.section).toBe("section");
  });

  it("finds internal markdown links", () => {
    const links = extractRawLinks("See [label](./folder/page)");
    expect(links).toHaveLength(1);
    expect(links[0]!.type).toBe("markdown");
    expect(links[0]!.target).toBe("./folder/page");
  });

  it("skips external markdown links", () => {
    const links = extractRawLinks("[Google](https://google.com)");
    expect(links).toHaveLength(0);
  });

  it("skips image embeds", () => {
    const links = extractRawLinks("![alt](image.png)");
    expect(links).toHaveLength(0);
  });
});

describe("extractExternalLinks", () => {
  it("finds https URLs in markdown links", () => {
    const links = extractExternalLinks("[Site](https://example.com)");
    expect(links).toContain("https://example.com");
  });

  it("finds bare URLs", () => {
    const links = extractExternalLinks("Visit https://example.com today");
    expect(links).toContain("https://example.com");
  });

  it("deduplicates", () => {
    const links = extractExternalLinks(
      "https://example.com and [link](https://example.com)",
    );
    expect(links.filter((l) => l === "https://example.com")).toHaveLength(1);
  });
});

describe("extractHeadings", () => {
  it("extracts headings of all levels", () => {
    const md = "# H1\n## H2\n### H3\ntext\n#### H4";
    const headings = extractHeadings(md);
    expect(headings).toEqual(["H1", "H2", "H3", "H4"]);
  });

  it("returns empty for no headings", () => {
    expect(extractHeadings("just text")).toEqual([]);
  });
});

describe("extractDescription", () => {
  it("extracts first sentences from body", () => {
    const desc = extractDescription(
      "First sentence. Second sentence. Third one. Fourth skipped.",
    );
    expect(desc).toContain("First sentence.");
    expect(desc).toContain("Second sentence.");
    expect(desc).toContain("Third one.");
  });
});

describe("countWords", () => {
  it("counts words in plain text", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("handles markdown syntax", () => {
    const count = countWords("**bold** and *italic* words");
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe("shouldIgnore", () => {
  it("ignores .obsidian", () => {
    expect(shouldIgnore(".obsidian")).toBe(true);
  });

  it("ignores node_modules", () => {
    expect(shouldIgnore("node_modules")).toBe(true);
  });

  it("ignores dot files", () => {
    expect(shouldIgnore(".git")).toBe(true);
    expect(shouldIgnore(".DS_Store")).toBe(true);
  });

  it("ignores macOS resource forks", () => {
    expect(shouldIgnore("._hidden")).toBe(true);
  });

  it("does not ignore normal files", () => {
    expect(shouldIgnore("note.md")).toBe(false);
    expect(shouldIgnore("folder")).toBe(false);
  });

  it("DEFAULT_IGNORES is populated", () => {
    expect(DEFAULT_IGNORES.length).toBeGreaterThan(0);
  });
});

describe("shouldIncludePath", () => {
  it("includes everything when include/exclude are empty", () => {
    expect(shouldIncludePath("projects/Svartz Site.md")).toBe(true);
  });

  it("filters by include glob", () => {
    expect(
      shouldIncludePath("projects/svartz/Svartz Architecture.md", [
        "projects/svartz/**/*.md",
      ]),
    ).toBe(true);
    expect(
      shouldIncludePath("literature/Book Summary.md", [
        "projects/svartz/**/*.md",
      ]),
    ).toBe(false);
  });

  it("exclude takes precedence over include", () => {
    expect(
      shouldIncludePath(
        "projects/svartz/Svartz Architecture.md",
        ["projects/**/*.md"],
        ["projects/svartz/**"],
      ),
    ).toBe(false);
  });
});

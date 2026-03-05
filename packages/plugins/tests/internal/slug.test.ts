import { describe, it, expect } from "vitest";
import { fileToSlug, deriveTitle } from "../../src/internal/slug";

describe("fileToSlug", () => {
  it("strips extension and lowercases", () => {
    expect(fileToSlug("Hello World.md")).toBe("hello-world");
  });

  it("preserves full path segments", () => {
    expect(fileToSlug("notes/daily/My Note.md")).toBe("notes/daily/my-note");
  });

  it("two files at different paths produce distinct slugs", () => {
    const a = fileToSlug("a/note.md");
    const b = fileToSlug("b/note.md");
    expect(a).not.toBe(b);
    expect(a).toBe("a/note");
    expect(b).toBe("b/note");
  });

  it("normalizes special characters", () => {
    expect(fileToSlug("Q&A Notes.md")).toBe("q-and-a-notes");
    expect(fileToSlug("100% Complete.md")).toBe("100-percent-complete");
  });

  it("collapses consecutive hyphens", () => {
    expect(fileToSlug("a---b.md")).toBe("a-b");
  });

  it("converts _index to index", () => {
    expect(fileToSlug("docs/_index.md")).toBe("docs/index");
  });

  it("strips trailing slash", () => {
    expect(fileToSlug("dir/")).toBe("dir");
  });

  it("is deterministic across calls", () => {
    const input = "My Complex & Long?# Title.md";
    expect(fileToSlug(input)).toBe(fileToSlug(input));
  });
});

describe("deriveTitle", () => {
  it("converts hyphens and underscores to spaces and capitalizes", () => {
    expect(deriveTitle("my-note")).toBe("My Note");
    expect(deriveTitle("my_note")).toBe("My Note");
  });

  it("trims whitespace", () => {
    expect(deriveTitle("  hello  ")).toBe("Hello");
  });
});

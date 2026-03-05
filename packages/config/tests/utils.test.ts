import { describe, it, expect } from "vitest";

const normalizePath = (path: string): string => path.replaceAll("\\", "/");

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("foo\\bar\\baz")).toBe("foo/bar/baz");
  });

  it("leaves forward slashes unchanged", () => {
    expect(normalizePath("foo/bar/baz")).toBe("foo/bar/baz");
  });

  it("handles empty string", () => {
    expect(normalizePath("")).toBe("");
  });

  it("handles mixed slashes", () => {
    expect(normalizePath("foo/bar\\baz")).toBe("foo/bar/baz");
  });
});

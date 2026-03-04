import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  normalizePath,
  searchUpward,
  isDirectory,
  fileExists,
} from "../src/utils/path-resolver.js";

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

describe("isDirectory", () => {
  it("returns true for a directory", async () => {
    expect(await isDirectory(resolve(__dirname, "fixtures"))).toBe(true);
  });

  it("returns false for a file", async () => {
    expect(
      await isDirectory(resolve(__dirname, "fixtures/valid-vault/.gitkeep")),
    ).toBe(false);
  });

  it("returns false for a nonexistent path", async () => {
    expect(await isDirectory("/tmp/nonexistent-path-12345")).toBe(false);
  });
});

describe("fileExists", () => {
  it("returns true for an existing file", async () => {
    expect(
      await fileExists(resolve(__dirname, "fixtures/valid-vault/.gitkeep")),
    ).toBe(true);
  });

  it("returns false for nonexistent file", async () => {
    expect(await fileExists("/tmp/no-such-file-98765.txt")).toBe(false);
  });
});

describe("searchUpward", () => {
  it("returns null when no config found (starting from /tmp)", async () => {
    const result = await searchUpward("/tmp");
    expect(result).toBeNull();
  });
});

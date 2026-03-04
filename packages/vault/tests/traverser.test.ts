import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { traverseVault } from "../src/index.js";
import { VaultNotFound } from "../src/types.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures/basic-vault");
const EMPTY_FIXTURE_PATH = resolve(__dirname, "fixtures/empty-vault");

describe("traverseVault", () => {
  it("discovers all .md files", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const paths = files.map((f) => f.path);

    expect(paths).toContain("Index.md");
    expect(paths).toContain("Getting Started.md");
    expect(paths).toContain("projects/Svartz Site.md");
    expect(paths).toContain("projects/svartz/Svartz Architecture.md");
  });

  it("returns files sorted by path", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const paths = files.map((f) => f.path);
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i].localeCompare(paths[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it("skips .obsidian directory", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const paths = files.map((f) => f.path);
    expect(paths.every((p) => !p.includes(".obsidian"))).toBe(true);
  });

  it("returns VaultFile objects with correct properties", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const indexFile = files.find((f) => f.name === "Index");

    expect(indexFile).toBeDefined();
    expect(indexFile!.path).toBe("Index.md");
    expect(indexFile!.name).toBe("Index");
    expect(indexFile!.extension).toBe(".md");
    expect(indexFile!.isDirectory).toBe(false);
  });

  it("handles empty vault", async () => {
    const files = await traverseVault(EMPTY_FIXTURE_PATH);
    expect(files).toEqual([]);
  });

  it("throws VaultNotFound for non-existent path", async () => {
    await expect(traverseVault("/nonexistent/path")).rejects.toThrow(
      VaultNotFound,
    );
    await expect(traverseVault("/nonexistent/path")).rejects.toMatchObject({
      _tag: "VaultNotFound",
    });
  });

  it("finds nested files", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const nested = files.find(
      (f) => f.path === "projects/svartz/Svartz Architecture.md",
    );
    expect(nested).toBeDefined();
    expect(nested!.name).toBe("Svartz Architecture");
  });

  it("supports include globs", async () => {
    const files = await traverseVault(FIXTURE_PATH, {
      include: ["projects/**/*.md"],
    });
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.path.startsWith("projects/"))).toBe(true);
  });

  it("supports exclude globs", async () => {
    const files = await traverseVault(FIXTURE_PATH, {
      exclude: ["**/Research Notes.md", "inbox/**"],
    });
    expect(files.some((f) => f.path === "literature/Research Notes.md")).toBe(
      false,
    );
    expect(files.some((f) => f.path.startsWith("inbox/"))).toBe(false);
  });

  it("applies exclude after include", async () => {
    const files = await traverseVault(FIXTURE_PATH, {
      include: ["projects/**/*.md"],
      exclude: ["projects/svartz/**"],
    });
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.path.startsWith("projects/svartz/"))).toBe(
      false,
    );
  });
});

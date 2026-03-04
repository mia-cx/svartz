import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  traverseVault,
  buildIndex,
  VaultNotFound,
  FileReadError,
  SlugConflict,
  ParseError,
} from "../src/index.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures/basic-vault");

describe("integration: traverseVault → buildIndex", () => {
  it("produces a complete index from a fixture vault", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    expect(index.version).toBeTruthy();
    expect(index.notes.length).toBeGreaterThan(0);
    expect(Object.keys(index.graph).length).toBe(index.notes.length);

    for (const note of index.notes) {
      expect(note.slug).toBeTruthy();
      expect(note.title).toBeTruthy();
      expect(note.path).toMatch(/\.md$/);
      expect(typeof note.wordCount).toBe("number");
      expect(typeof note.readingTimeMinutes).toBe("number");
      expect(Array.isArray(note.links)).toBe(true);
      expect(Array.isArray(note.externalLinks)).toBe(true);
      expect(Array.isArray(note.headings)).toBe(true);
      expect(Array.isArray(note.tags)).toBe(true);
    }

    for (const [slug, outgoing] of Object.entries(index.graph)) {
      const note = index.notes.find((n) => n.slug === slug);
      expect(note).toBeDefined();
      expect(outgoing).toEqual(note!.links);
    }
  });

  it("round-trips: all graph entries have matching notes", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const slugs = new Set(index.notes.map((n) => n.slug));
    for (const slug of Object.keys(index.graph)) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  it("exports tagged error classes that extend Error", () => {
    const err = new VaultNotFound({
      path: "/test",
      message: "test error",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VaultNotFound);
    expect(err._tag).toBe("VaultNotFound");
    expect(err.message).toBe("test error");
    expect(err.path).toBe("/test");

    const readErr = new FileReadError({
      path: "/file",
      message: "read failed",
      attempts: 3,
    });
    expect(readErr).toBeInstanceOf(Error);
    expect(readErr._tag).toBe("FileReadError");
    expect(readErr.attempts).toBe(3);

    const slugErr = new SlugConflict({
      slug: "dup",
      message: "conflict",
    });
    expect(slugErr).toBeInstanceOf(Error);
    expect(slugErr._tag).toBe("SlugConflict");

    const parseErr = new ParseError({
      path: "/bad",
      message: "parse failed",
    });
    expect(parseErr).toBeInstanceOf(Error);
    expect(parseErr._tag).toBe("ParseError");
  });

  it("alias resolution works end-to-end", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const indexNote = index.notes.find((n) => n.slug === "index");
    expect(indexNote!.aliases).toContain("home");
    expect(indexNote!.aliases).toContain("index");

    const bookSummary = index.notes.find(
      (n) => n.slug === "literature/book-summary",
    );
    expect(bookSummary!.aliases).toContain("book-review");
  });

  it("indexes only included files when traversal filters are provided", async () => {
    const files = await traverseVault(FIXTURE_PATH, {
      include: ["projects/**/*.md"],
      exclude: ["projects/svartz/**"],
    });
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    expect(index.notes.length).toBeGreaterThan(0);
    expect(
      index.notes.every((note) => note.path.startsWith("projects/")),
    ).toBe(true);
    expect(
      index.notes.some((note) => note.path.startsWith("projects/svartz/")),
    ).toBe(false);
  });
});

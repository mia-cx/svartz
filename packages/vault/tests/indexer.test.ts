import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { traverseVault, buildIndex } from "../src/index.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures/basic-vault");
const PUBLISHED_FIXTURE_PATH = resolve(__dirname, "fixtures/published-vault");

describe("buildIndex", () => {
  it("generates an index with correct structure", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    expect(index.version).toBe("0.0.1");
    expect(index.notes).toHaveLength(15);
    expect(index.graph).toBeDefined();
    Object.values(index.graph).forEach((links) =>
      expect(Array.isArray(links)).toBe(true),
    );
  });

  it("extracts frontmatter title", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });
    const indexNote = index.notes.find((n) => n.slug === "index");

    expect(indexNote).toBeDefined();
    expect(indexNote!.title).toBe("Welcome");
  });

  it("derives title from filename when no frontmatter title", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });
    const roadmap = index.notes.find(
      (n) => n.slug === "projects/feature-roadmap",
    );

    expect(roadmap).toBeDefined();
    expect(roadmap!.title).toBe("Feature Roadmap");
  });

  it("extracts tags from frontmatter", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });
    const indexNote = index.notes.find((n) => n.slug === "index");

    expect(indexNote!.tags).toContain("welcome");
  });

  it("extracts aliases from frontmatter", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });
    const indexNote = index.notes.find((n) => n.slug === "index");

    expect(indexNote!.aliases).toEqual(["home", "index"]);
  });

  it("detects draft status", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const research = index.notes.find(
      (n) => n.slug === "literature/research-notes",
    );
    expect(research!.draft).toBe(true);

    const indexNote = index.notes.find((n) => n.slug === "index");
    expect(indexNote!.draft).toBe(false);
  });

  it("infers draft from publishedField when configured", async () => {
    const files = await traverseVault(PUBLISHED_FIXTURE_PATH);
    const index = await buildIndex(files, {
      vaultPath: PUBLISHED_FIXTURE_PATH,
      publishedField: "published",
    });

    const publishedTrue = index.notes.find((n) => n.slug === "published-true");
    const publishedFalse = index.notes.find((n) => n.slug === "published-false");
    const publishedAbsent = index.notes.find((n) => n.slug === "published-absent");

    expect(publishedTrue!.draft).toBe(false);
    expect(publishedFalse!.draft).toBe(true);
    expect(publishedAbsent!.draft).toBe(true);
  });

  it("prefers publishedField over draftField when both are provided", async () => {
    const files = await traverseVault(PUBLISHED_FIXTURE_PATH);
    const index = await buildIndex(files, {
      vaultPath: PUBLISHED_FIXTURE_PATH,
      draftField: "draft",
      publishedField: "published",
    });

    const publishedTrue = index.notes.find((n) => n.slug === "published-true");
    expect(publishedTrue!.draft).toBe(false);
  });

  it("resolves wikilinks to canonical slugs", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const gettingStarted = index.notes.find(
      (n) => n.slug === "getting-started",
    );
    expect(gettingStarted!.links).toContain("inbox/project-ideas");
    expect(gettingStarted!.links).toContain("inbox/meeting-notes");
  });

  it("resolves markdown links to canonical slugs", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const svartz = index.notes.find(
      (n) => n.slug === "projects/svartz-site",
    );
    expect(svartz!.links).toContain("getting-started");
  });

  it("deduplicates outgoing links", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const deployment = index.notes.find(
      (n) => n.slug === "projects/deployment-guide",
    );
    const gettingStartedRefs = deployment!.links.filter(
      (l) => l === "getting-started",
    );
    expect(gettingStartedRefs).toHaveLength(1);
  });

  it("extracts external links", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const indexNote = index.notes.find((n) => n.slug === "index");
    expect(indexNote!.externalLinks).toContain("https://example.com.");
  });

  it("extracts headings", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const gettingStarted = index.notes.find(
      (n) => n.slug === "getting-started",
    );
    expect(gettingStarted!.headings).toContain("Getting Started");
    expect(gettingStarted!.headings).toContain("First Steps");
  });

  it("counts words", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    for (const note of index.notes) {
      expect(note.wordCount).toBeGreaterThan(0);
      expect(note.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles draft notes", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const research = index.notes.find(
      (n) => n.slug === "literature/research-notes",
    );
    expect(research).toBeDefined();
    expect(research!.title).toBe("Research Notes");
    expect(research!.draft).toBe(true);
  });

  it("builds a valid graph with all slugs", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    expect(Object.keys(index.graph)).toHaveLength(15);
    for (const note of index.notes) {
      expect(index.graph[note.slug]).toBeDefined();
      expect(Array.isArray(index.graph[note.slug])).toBe(true);
    }
  });

  it("uses frontmatter dates when available", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const gettingStarted = index.notes.find(
      (n) => n.slug === "getting-started",
    );
    expect(gettingStarted!.createdAt).toEqual(new Date("2025-01-01"));
    expect(gettingStarted!.modifiedAt).toEqual(new Date("2025-03-01"));
  });

  it("falls back to fs.stat dates when no frontmatter dates", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const indexNote = index.notes.find((n) => n.slug === "index");
    expect(indexNote!.createdAt).toBeInstanceOf(Date);
    expect(indexNote!.modifiedAt).toBeInstanceOf(Date);
  });

  it("uses frontmatter description when available", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const inbox = index.notes.find(
      (n) => n.slug === "inbox/daily-capture",
    );
    expect(inbox!.description).toBe("Daily notes and quick captures");
  });

  it("extracts description from first paragraph when no frontmatter", async () => {
    const files = await traverseVault(FIXTURE_PATH);
    const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });

    const indexNote = index.notes.find((n) => n.slug === "index");
    expect(indexNote!.description).toBeTruthy();
    expect(indexNote!.description).toContain("main entry point");
  });
});

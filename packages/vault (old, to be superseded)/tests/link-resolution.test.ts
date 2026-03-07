import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { traverseVault, buildIndex } from "../src/index.js";
import type { LinkResolutionStrategy } from "../src/types.js";

const FIXTURE_PATH = resolve(__dirname, "fixtures/strategy-vault");

/**
 * Fixture layout:
 *   readme.md            → links to [[setup]] (exact match) and [[helper]] (ambiguous)
 *   setup.md             → root-level setup
 *   notes/setup.md
 *   notes/helper.md
 *   projects/setup.md
 *   projects/guide.md    → links to [[helper]] (ambiguous basename)
 *   projects/helper.md
 *   projects/deep/setup.md
 *   projects/deep/helper.md
 *
 * "helper" exists at notes/, projects/, and projects/deep/ but NOT at root,
 * so the slug map won't have an unambiguous "helper" entry — strategy matters.
 */

const buildWithStrategy = async (strategy: LinkResolutionStrategy) => {
  const files = await traverseVault(FIXTURE_PATH);
  return buildIndex(files, {
    vaultPath: FIXTURE_PATH,
    linkResolution: strategy,
  });
};

describe("link resolution strategies", () => {
  describe("closest", () => {
    it("resolves ambiguous basename to the nearest neighbor of the source", async () => {
      const index = await buildWithStrategy("closest");
      const guide = index.notes.find((n) => n.slug === "projects/guide");

      expect(guide).toBeDefined();
      expect(guide!.links).toContain("projects/helper");
      expect(guide!.links).not.toContain("notes/helper");
      expect(guide!.links).not.toContain("projects/deep/helper");
    });

    it("resolves ambiguous basename to self when source has the most shared depth", async () => {
      const index = await buildWithStrategy("closest");
      const deepHelper = index.notes.find(
        (n) => n.slug === "projects/deep/helper",
      );

      expect(deepHelper).toBeDefined();
      // [[helper]] from projects/deep/helper: candidates are notes/helper (0 shared),
      // projects/helper (1 shared), projects/deep/helper (2 shared — self).
      // "closest" picks projects/deep/helper because it shares the most path segments.
      expect(deepHelper!.links).toContain("projects/deep/helper");
      expect(deepHelper!.links).not.toContain("notes/helper");
    });

    it("resolves exact slug match regardless of strategy", async () => {
      const index = await buildWithStrategy("closest");
      const readme = index.notes.find((n) => n.slug === "readme");

      expect(readme).toBeDefined();
      expect(readme!.links).toContain("setup");
    });
  });

  describe("shallowest", () => {
    it("resolves ambiguous basename to the least nested candidate", async () => {
      const index = await buildWithStrategy("shallowest");
      const guide = index.notes.find((n) => n.slug === "projects/guide");

      expect(guide).toBeDefined();
      // notes/helper and projects/helper are both depth 2; alphabetically notes/helper wins
      expect(guide!.links).toContain("notes/helper");
      expect(guide!.links).not.toContain("projects/deep/helper");
    });

    it("picks alphabetically first when depth ties", async () => {
      const index = await buildWithStrategy("shallowest");
      const readme = index.notes.find((n) => n.slug === "readme");

      expect(readme).toBeDefined();
      expect(readme!.links).toContain("notes/helper");
    });
  });

  describe("absolute", () => {
    it("does not resolve ambiguous basenames", async () => {
      const index = await buildWithStrategy("absolute");
      const guide = index.notes.find((n) => n.slug === "projects/guide");

      expect(guide).toBeDefined();
      expect(guide!.links).not.toContain("notes/helper");
      expect(guide!.links).not.toContain("projects/helper");
      expect(guide!.links).not.toContain("projects/deep/helper");
      expect(guide!.links).toHaveLength(0);
    });

    it("resolves exact full-path slugs", async () => {
      const index = await buildWithStrategy("absolute");
      const readme = index.notes.find((n) => n.slug === "readme");

      expect(readme).toBeDefined();
      expect(readme!.links).toContain("setup");
    });

    it("does not resolve bare basenames that match a nested file", async () => {
      const index = await buildWithStrategy("absolute");
      const readme = index.notes.find((n) => n.slug === "readme");

      expect(readme!.links).not.toContain("notes/helper");
      expect(readme!.links).not.toContain("projects/helper");
    });
  });

  describe("default strategy", () => {
    it("defaults to closest when no strategy is specified", async () => {
      const files = await traverseVault(FIXTURE_PATH);
      const index = await buildIndex(files, { vaultPath: FIXTURE_PATH });
      const guide = index.notes.find((n) => n.slug === "projects/guide");

      expect(guide).toBeDefined();
      expect(guide!.links).toContain("projects/helper");
    });
  });
});

import { describe, it, expect } from "vitest";
import { resolveLink, buildSlugMap } from "../../src/internal/resolve";
import type { RawLink } from "@svartz/core";

const makeLink = (target: string): RawLink => ({
  raw: `[[${target}]]`,
  target,
  type: "wikilink",
});

describe("buildSlugMap", () => {
  it("maps canonical slugs", () => {
    const map = buildSlugMap([
      { slug: "notes/hello" },
      { slug: "notes/world" },
    ]);
    expect(map["notes/hello"]).toBe("notes/hello");
    expect(map["notes/world"]).toBe("notes/world");
  });

  it("maps basenames when unambiguous", () => {
    const map = buildSlugMap([{ slug: "notes/hello" }]);
    expect(map["hello"]).toBe("notes/hello");
  });

  it("excludes ambiguous basenames", () => {
    const map = buildSlugMap([
      { slug: "a/note" },
      { slug: "b/note" },
    ]);
    expect(map["note"]).toBeUndefined();
    expect(map["a/note"]).toBe("a/note");
    expect(map["b/note"]).toBe("b/note");
  });

  it("maps aliases when unambiguous", () => {
    const map = buildSlugMap([
      { slug: "notes/hello", aliases: ["greeting"] },
    ]);
    expect(map["greeting"]).toBe("notes/hello");
  });

  it("keeps physical basenames after explicit slug allocation", () => {
    const map = buildSlugMap([{ slug: "guides/setup", path: "guides/Setup Notes.md" }]);
    expect(map["setup notes"]).toBe("guides/setup");
    expect(map["setup-notes"]).toBe("guides/setup");
  });

  it("keeps root authored names ahead of another note's basename", () => {
    const entries = [
      { slug: "root", path: "setup.md" },
      { slug: "guides/setup", path: "guides/other.md" },
    ];
    for (const order of [entries, [...entries].reverse()]) {
      expect(buildSlugMap(order).setup).toBe("root");
    }
  });

  it("keeps the canonical winner for duplicate authored stems", () => {
    const entries = [
      { slug: "foo", path: "foo.md" },
      { slug: "foo-2", path: "foo.svx" },
    ];
    for (const order of [entries, [...entries].reverse()]) {
      const map = buildSlugMap(order);
      expect(map.foo).toBe("foo");
      expect(map["foo.md"]).toBe("foo");
      expect(map["foo.svx"]).toBe("foo-2");
    }
    const svxWinner = buildSlugMap([
      { slug: "foo-2", path: "foo.md" },
      { slug: "foo", path: "foo.svx" },
    ]);
    expect(svxWinner.foo).toBe("foo");
    expect(svxWinner["foo.md"]).toBe("foo-2");
    expect(svxWinner["foo.svx"]).toBe("foo");
  });

  it("keeps an authored-stem winner when another filename owns its natural route", () => {
    const entries = [
      { slug: "foo-bar", path: "foo-bar.md" },
      { slug: "foo-bar-2", path: "foo bar.md" },
      { slug: "foo-bar-3", path: "foo bar.svx" },
    ];
    for (const order of [entries, [...entries].reverse()]) {
      const map = buildSlugMap(order);
      expect(map["foo bar"]).toBe("foo-bar-2");
      expect(map["foo bar.md"]).toBe("foo-bar-2");
      expect(map["foo bar.svx"]).toBe("foo-bar-3");
      expect(map["foo-bar"]).toBe("foo-bar");
      expect(resolveLink(makeLink("foo bar"), map, entries.map((entry) => entry.slug), "absolute", "links"))
        .toBe("foo-bar-2");
    }
  });

  it("excludes ambiguous aliases", () => {
    const map = buildSlugMap([
      { slug: "a/one", aliases: ["shared"] },
      { slug: "b/two", aliases: ["shared"] },
    ]);
    expect(map["shared"]).toBeUndefined();
  });
});

describe("resolveLink", () => {
  const allSlugs = [
    "notes/alpha",
    "notes/beta",
    "docs/alpha",
    "deep/nested/gamma",
  ];

  const slugMap = buildSlugMap(
    allSlugs.map((slug) => ({ slug })),
  );

  it("resolves exact slug match", () => {
    const result = resolveLink(
      makeLink("notes/alpha"),
      slugMap,
      allSlugs,
      "closest",
      "notes/beta",
    );
    expect(result).toBe("notes/alpha");
  });

  it("resolves basename with closest strategy", () => {
    const result = resolveLink(
      makeLink("alpha"),
      slugMap,
      allSlugs,
      "closest",
      "notes/beta",
    );
    expect(result).toBe("notes/alpha");
  });

  it("resolves basename with shallowest strategy", () => {
    const result = resolveLink(
      makeLink("alpha"),
      slugMap,
      allSlugs,
      "shallowest",
      "deep/nested/gamma",
    );
    expect(result).toBe("docs/alpha");
  });

  it("returns null with absolute strategy for basename-only", () => {
    const result = resolveLink(
      makeLink("alpha"),
      slugMap,
      allSlugs,
      "absolute",
      "notes/beta",
    );
    expect(result).toBeNull();
  });

  it("returns null for empty target", () => {
    const result = resolveLink(
      makeLink(""),
      slugMap,
      allSlugs,
      "closest",
      "notes/beta",
    );
    expect(result).toBeNull();
  });

  it("deterministic tie-break: lexicographic for equal depth", () => {
    const slugs = ["a/item", "b/item"];
    const map = buildSlugMap(slugs.map((slug) => ({ slug })));

    const r1 = resolveLink(makeLink("item"), map, slugs, "shallowest", "c/other");
    const r2 = resolveLink(makeLink("item"), map, slugs, "shallowest", "c/other");
    expect(r1).toBe(r2);
    expect(r1).toBe("a/item");
  });

  it("resolves ambiguous physical basenames after explicit slug allocation", () => {
    const sources = [
      { slug: "guides/setup", path: "guides/Setup Notes.md" },
      { slug: "notes/install", path: "notes/Setup Notes.md" },
    ];
    for (const order of [sources, [...sources].reverse()]) {
      const map = buildSlugMap(order);
      const slugs = order.map((entry) => entry.slug);
      expect(resolveLink(makeLink("Setup Notes"), map, slugs, "closest", "notes/start", order))
        .toBe("notes/install");
      expect(resolveLink(makeLink("Setup Notes"), map, slugs, "shallowest", "notes/start", order))
        .toBe("guides/setup");
      expect(resolveLink(makeLink("Setup Notes"), map, slugs, "absolute", "notes/start", order))
        .toBeNull();
    }
  });

  it("resolves full physical paths after a frontmatter slug changes the URL", () => {
    const sources = [
      { slug: "a/setup", path: "a/Setup Notes.md" },
      { slug: "b/install", path: "b/Setup Notes.md" },
    ];
    for (const order of [sources, [...sources].reverse()]) {
      const map = buildSlugMap(order);
      const slugs = order.map((entry) => entry.slug);
      for (const target of ["b/setup-notes", "b/Setup Notes"]) {
        expect(resolveLink(makeLink(target), map, slugs, "closest", "a/start", order)).toBe("b/install");
        expect(resolveLink(makeLink(target), map, slugs, "absolute", "a/start", order)).toBe("b/install");
      }
    }
  });

  it("lets a physical path win over another note's allocated slug", () => {
    // x/foo.md sets slug: bar -> x/bar; x/bar.md loses its natural URL -> x/bar-2.
    const sources = [
      { slug: "x/bar", path: "x/foo.md" },
      { slug: "x/bar-2", path: "x/bar.md" },
    ];
    const map = buildSlugMap(sources);
    const slugs = sources.map((entry) => entry.slug);
    expect(resolveLink(makeLink("x/bar"), map, slugs, "closest", "a/start", sources)).toBe("x/bar-2");
    expect(resolveLink(makeLink("x/foo"), map, slugs, "closest", "a/start", sources)).toBe("x/bar");
  });
});

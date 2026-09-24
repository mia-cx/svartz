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
});

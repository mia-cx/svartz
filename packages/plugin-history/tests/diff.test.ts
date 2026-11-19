import { describe, expect, it } from "vitest";
import { diffLines } from "../src/diff";

/** A hunk as `-old`, `+new` and ` same` lines. */
const unified = (before: string, after: string) =>
  diffLines(before, after)?.map((hunk) => hunk.map(({ kind, text }) => `${kind === "add" ? "+" : kind === "del" ? "-" : " "}${text}`));

const numbered = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join("\n");

describe("diffLines", () => {
  // Proves the diff a reader sees: each change with three lines of context, apart when far apart, nothing for no change,
  // and no diff at all past the cap, so a reader can't make the server diff two unrelated pages.
  it.each([
    ["no change", "a\nb\n", "a\nb\n", []],
    ["only line endings changed, as an editor on Windows saves", "a\r\nb\r\n", "a\nb\n", []],
    ["a new page", "", "# Title\n\nBody\n", [["+# Title", "+", "+Body"]]],
    ["a changed line, with its context", "1\n2\n3\n4\n5\n6\n7\n", "1\n2\n3\nfour\n5\n6\n7\n", [[" 1", " 2", " 3", "-4", "+four", " 5", " 6", " 7"]]],
    [
      "two changes far apart, as two hunks",
      numbered(20, "line"),
      numbered(20, "line").replace("line 2\n", "line two\n").replace("line 19\n", "line nineteen\n"),
      [
        [" line 1", "-line 2", "+line two", " line 3", " line 4", " line 5"],
        [" line 16", " line 17", " line 18", "-line 19", "+line nineteen", " line 20"],
      ],
    ],
    ["two pages with nothing in common, past the cap", numbered(600, "old"), numbered(600, "new"), undefined],
  ])("%s", (_case, before, after, expected) => {
    expect(unified(before, after)).toEqual(expected);
  });
});

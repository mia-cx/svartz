import { expect, it } from "vitest";
import { decodeRoutePath } from "../src/route-path";

// Proves URL paths match decoded index keys without decoding a literal percent escape twice.
it.each([
  ["/caf%C3%A9/", "/café/"],
  ["/%E6%97%A5%E6%9C%AC%E8%AA%9E", "/日本語"],
  ["/site/docs/caf%C3%A9", "/site/docs/café"],
  ["/a%3Fb%23c%2Fd/", "/a?b#c/d/"],
  ["/100%25/", "/100%/"],
  ["/%252F/", "/%2F/"],
  ["/", "/"],
  ["/caf%E9/", undefined],
  ["/%E0%A4%A/", undefined],
] as const)("resolves %s to %s", (pathname, expected) => {
  expect(decodeRoutePath(pathname)).toBe(expected);
});

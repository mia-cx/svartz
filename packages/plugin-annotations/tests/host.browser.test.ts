/** A host app's own page, which names its note by vault and slug instead of the route and key. */
import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import "../src/browser.css";
import { describe as describeRange, rangeOf } from "../src/anchor";
import { attach, HIGHLIGHT } from "../src/browser";
import { ADA } from "./data";

const QUOTE = "the dew point";

let detach: (() => void) | undefined;

afterEach(() => {
  detach?.();
  detach = undefined;
  document.body.innerHTML = "";
});

it("finds a host vault's annotations from the vault and the note's slug", async () => {
  document.body.innerHTML = `<main style="max-inline-size: 42rem; margin: 2rem auto"><article>Humidity alone says little; with temperature it gives ${QUOTE}.</article></main>`;
  const root = document.querySelector("article")!;
  const start = root.textContent!.indexOf(QUOTE);
  const anchor = describeRange(root, rangeOf(root, { start, end: start + QUOTE.length }));
  await commands.seedComments([
    { id: "dew", page: "hardware/sensors", author: ADA, anchor, body: "Check it each morning.", createdAt: "2026-11-02T09:00:00.000Z" },
  ]);

  // As `vaults` from virtual:svartz/host lists a vault mounted at /notes with no deployment base.
  detach = attach(root, { vault: { basePath: "", mountPath: "/notes" }, slug: "hardware/sensors" });

  await expect.poll(() => [...CSS.highlights.get(HIGHLIGHT) ?? []].map((range) => range.toString())).toEqual([QUOTE]);
  expect(document.querySelector(".sv-annotations-marker")?.getAttribute("aria-label")).toContain("Ada Lovelace");
});

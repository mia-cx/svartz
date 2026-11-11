import { afterEach, describe, expect, it } from "vitest";
// The body of vaults/showcase/hardware/sensors.md as theme-minimal renders it: links, a footnote, a callout, a table.
import note from "./fixtures/sensors.html?raw";
import { describe as describeRange, locate, rangeOf, type Anchor } from "../src/anchor";

function render(): HTMLElement {
  document.body.innerHTML = note;
  return document.querySelector("article")!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** The boundary point at the start (or end) of the `occurrence`-th text node holding `needle`. */
function at(root: Node, needle: string, edge: "start" | "end", occurrence = 0): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const index = node.data.indexOf(needle);
    if (index === -1 || seen++ < occurrence) continue;
    return [node, edge === "start" ? index : index + needle.length];
  }
  throw new Error(`"${needle}" isn't in the note`);
}

function select(root: Node, from: string, to: string, occurrence = 0): Range {
  const range = document.createRange();
  range.setStart(...at(root, from, "start", occurrence));
  range.setEnd(...at(root, to, "end", occurrence));
  return range;
}

describe("describe then locate", () => {
  it.each<[string, (root: HTMLElement) => Range, string]>([
    ["within one text node", (root) => select(root, "reads temperature", "±0.1 °C"), "reads temperature to ±0.1 °C"],
    ["across a link's markup", (root) => select(root, "Combined with", "dew point"), "Combined with temperature it gives the dew point"],
    ["with characters outside ASCII", (root) => select(root, "I²C", "bus"), "I²C bus"],
    // The paragraph and the title's icon each end in a space between tags.
    ["from a paragraph into a callout's title", (root) => select(root, "which does.", "Condensation"), "which does.  Condensation"],
    ["over a whole table cell, as a triple-click selects it", (root) => {
      const range = document.createRange();
      range.selectNodeContents([...root.querySelectorAll("td")].find((cell) => cell.textContent === "BMP390")!);
      return range;
    }, "BMP390"],
  ])("finds a passage selected %s again", (_case, selection, quote) => {
    const root = render();

    const anchor = describeRange(root, selection(root));
    const found = locate(root.textContent!, anchor);

    expect(anchor.exact).toBe(quote);
    expect(found).toEqual({ start: anchor.start, end: anchor.end });
    expect(rangeOf(root, found!).toString()).toBe(quote);
  });

  it("keeps up to 32 characters of context on each side", () => {
    const root = render();

    const anchor = describeRange(root, select(root, "Bosch", "BMP390"));

    expect(anchor.exact).toBe("Bosch BMP390");
    expect(anchor.prefix).toHaveLength(32);
    expect(anchor.prefix.endsWith("A ")).toBe(true);
    expect(anchor.suffix).toBe(" reads station pressure. Weather");
  });
});

describe("after the note changes", () => {
  /** Anchor the second "SHT45", in "The same SHT45 reports relative humidity". */
  function anchorRepeatedQuote(): Anchor {
    const root = render();
    const anchor = describeRange(root, select(root, "SHT45", "SHT45", 1));
    expect(anchor.suffix.startsWith(" reports relative humidity")).toBe(true);
    return anchor;
  }

  it.each<[string, (root: HTMLElement) => void, string | null]>([
    ["finds it after words are inserted before it, by the occurrence its context matches", (root) => {
      root.querySelector("p")!.prepend("Last updated in October. ");
    }, " reports relative humidity"],
    ["finds it after markup is reflowed around it", (root) => {
      const paragraph = [...root.querySelectorAll("p")].find((p) => p.textContent!.startsWith("The same SHT45"))!;
      paragraph.innerHTML = paragraph.innerHTML.replace("relative humidity", "<em>relative humidity</em>");
    }, " reports relative humidity"],
    ["loses it once its quote is gone from the note", (root) => {
      for (const paragraph of root.querySelectorAll("p")) paragraph.textContent = paragraph.textContent!.replaceAll("SHT45", "sensor");
      for (const cell of root.querySelectorAll("td")) cell.textContent = cell.textContent!.replaceAll("SHT45", "sensor");
    }, null],
  ])("%s", (_case, edit, suffix) => {
    const anchor = anchorRepeatedQuote();
    const root = render();
    edit(root);
    const text = root.textContent!;

    const found = locate(text, anchor);

    if (suffix === null) return expect(found).toBeNull();
    expect(text.slice(found!.start, found!.end)).toBe("SHT45");
    expect(text.slice(found!.end).startsWith(suffix)).toBe(true);
  });
});

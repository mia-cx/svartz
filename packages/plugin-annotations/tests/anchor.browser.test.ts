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

/** The anchor for `text.slice(start, end)` in a note of plain `text`. */
function anchorIn(text: string, start: number, end: number): Anchor {
  const root = document.createElement("article");
  root.textContent = text;
  return describeRange(root, rangeOf(root, { start, end }));
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

describe("after a light edit to the passage", () => {
  /** Swap `from` for `to` in the note's text nodes, leaving its markup alone. */
  function replace(root: HTMLElement, from: string, to: string): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (node.data.includes(from)) return void (node.data = node.data.replace(from, to));
    }
    throw new Error(`"${from}" isn't in the note`);
  }

  interface Edit {
    /** The passage anchored: the first `quote` after `after` in the note as `before` leaves it. */
    readonly quote: string;
    readonly after?: string;
    readonly before?: (root: HTMLElement) => void;
    /** The author's edit, made to a fresh copy of the note. */
    readonly edit: (root: HTMLElement) => void;
    /** The passage expected there now, followed by `then`; `null` when it's gone. */
    readonly found: string | null;
    readonly then?: string;
  }

  it.each<[string, Edit]>([
    ["keeps a passage whose typos were fixed", {
      quote: "Readings stay hihg untill it dries.",
      before: (root) => replace(root, "Readings stay high until it dries.", "Readings stay hihg untill it dries."),
      edit: () => {},
      found: "Readings stay high until it dries.",
    }],
    ["keeps a passage with a word inserted into it", {
      quote: "A Bosch BMP390 reads station pressure.",
      edit: (root) => replace(root, "reads station pressure", "reads the station's pressure"),
      found: "A Bosch BMP390 reads the station's pressure.",
    }],
    ["keeps a short passage with words inserted right before it", {
      quote: "SHT45",
      after: "The same",
      edit: (root) => replace(root, "The same SHT45", "Last updated in October. The same calibrated SHT45"),
      found: "SHT45",
      then: " reports relative humidity",
    }],
    ["keeps a sentence reflowed across lines", {
      quote: "Humidity alone says little about comfort.",
      edit: (root) => replace(root, "Humidity alone says little about comfort.", "Humidity alone says\nlittle about\ncomfort."),
      found: "Humidity alone says\nlittle about\ncomfort.",
    }],
    ["loses a passage rewritten in other words", {
      quote: "Readings stay high until it dries.",
      edit: (root) => replace(root, "Readings stay high until it dries.", "The numbers lag until the film evaporates."),
      found: null,
    }],
    ["loses a deleted passage even though its words are in another one", {
      quote: "relative humidity",
      edit: (root) => replace(root, "The same SHT45 reports relative humidity. ", ""),
      found: null,
    }],
    ["loses a table cell whose row was removed, though the next row reads almost the same", {
      quote: "I²C",
      after: "BMP390Pressure",
      edit: (root) => root.querySelectorAll("tbody tr")[1]!.remove(),
      found: null,
    }],
  ])("%s", (_case, { quote, after = "", before, edit, found: expected, then = "" }) => {
    let root = render();
    before?.(root);
    const start = root.textContent!.indexOf(quote, root.textContent!.indexOf(after));
    const anchor = describeRange(root, rangeOf(root, { start, end: start + quote.length }));
    root = render();
    edit(root);
    const text = root.textContent!;

    const found = locate(text, anchor);

    if (expected === null) return expect(found).toBeNull();
    expect(found && text.slice(found.start, found.end)).toBe(expected);
    expect(text.slice(found!.end).startsWith(then)).toBe(true);
  });

  it("keeps the passage among repeats whose words and context are all the same", () => {
    const sentence = "A sentence which repeats identically in a checklist. ";
    const original = sentence.repeat(5);
    const start = 2 * sentence.length + sentence.indexOf("repeats");
    const anchor = anchorIn(original, start, start + "repeats".length);
    const text = "Introduction added. " + original;

    expect(locate(text, anchor)?.start).toBe(start + "Introduction added. ".length);
  });

  it("keeps a passage whose quote now repeats many times nearer where it was", () => {
    const original = "In the northern sheltered garden, temperature is measured once every morning.";
    const start = original.indexOf("temperature");
    const anchor = anchorIn(original, start, start + "temperature".length);
    const text = "temperature reading; ".repeat(70) + original.replace("northern", "southern");

    const found = locate(text, anchor);

    expect(found && text.slice(found.end)).toBe(" is measured once every morning.");
  });

  it("keeps a passage wrapped in punctuation among more repeats than are scored", () => {
    const original = "In the northern sheltered garden, temperature is measured once every morning.";
    const start = original.indexOf("temperature");
    const anchor = anchorIn(original, start, start + "temperature".length);
    const text = original.replace("temperature", "(temperature)") + " temperature reading;".repeat(70);

    expect(locate(text, anchor)).toEqual({ start: start + 1, end: start + 1 + "temperature".length });
  });

  it("stays fast on a long note with a long passage that changed", () => {
    const root = render();
    const quote = root.querySelector(".sv-callout-body")!.textContent!.slice(0, 200);
    const start = root.textContent!.indexOf(quote);
    const anchor = describeRange(root, rangeOf(root, { start, end: start + quote.length }));
    // About a megabyte of note, the passage edited and still in its place.
    const text = root.textContent!.replace("film of water", "film of dew").repeat(400);

    const began = performance.now();
    const found = locate(text, anchor);

    expect(performance.now() - began).toBeLessThan(150);
    expect(found?.start).toBe(start);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import "../src/browser.css";
// The body of vaults/showcase/hardware/sensors.md as theme-minimal renders it.
import note from "./fixtures/sensors.html?raw";
import { describe as describeRange, rangeOf } from "../src/anchor";
import { attach, HIGHLIGHT } from "../src/browser";
import { ADA, ENDPOINT, GRACE, type SeedComment } from "./data";

declare module "vitest/browser" {
  interface BrowserCommands {
    seedComments(comments: SeedComment[]): Promise<void>;
  }
}

const DEW_POINT = "Combined with temperature it gives the dew point";
const PRESSURE = "Bosch BMP390";

let detach: (() => void) | undefined;

function render(): HTMLElement {
  document.body.innerHTML = `<main style="max-inline-size: 42rem; margin: 2rem auto; padding-inline: 1rem; font: 16px/1.6 system-ui">${note}</main>`;
  return document.querySelector("article")!;
}

/** The anchor a reader selecting `quote` in the note would store. */
function anchorOf(root: HTMLElement, quote: string) {
  const start = root.textContent!.indexOf(quote);
  return describeRange(root, rangeOf(root, { start, end: start + quote.length }));
}

beforeEach(async () => {
  const root = render();
  await commands.seedComments([
    {
      id: "dew-point", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, DEW_POINT), createdAt: "2026-11-02T09:00:00.000Z",
      body: "Dew point is the number I check every morning.\nMore at https://en.wikipedia.org/wiki/Dew_point.",
    },
    {
      id: "pressure", page: "hardware/sensors", author: GRACE, anchor: anchorOf(root, PRESSURE), createdAt: "2026-11-03T09:00:00.000Z",
      body: "<b>Is</b> the 42 m measured at the sensor?",
    },
    {
      id: "removed", page: "hardware/sensors", author: GRACE, createdAt: "2026-11-04T09:00:00.000Z", body: "Which roof?",
      anchor: { exact: "anemometer on the roof", prefix: "", suffix: "", start: 10, end: 32 },
    },
  ]);
});

afterEach(async () => {
  detach?.();
  detach = undefined;
  document.body.innerHTML = "";
  await page.viewport(1440, 900);
});

async function attached(root = render()) {
  detach = attach(root, { endpoint: ENDPOINT, page: "hardware/sensors" });
  await expect.poll(() => document.querySelectorAll(".sv-annotations-marker").length).toBe(2);
  return [...document.querySelectorAll<HTMLButtonElement>(".sv-annotations-marker")];
}

const highlighted = () => [...CSS.highlights.get(HIGHLIGHT) ?? []].map((range) => range.toString());

describe("a page with comments, read signed out", () => {
  it("highlights each passage and puts a marker beside its first line, leaving the note as it was", async () => {
    const root = render();
    const before = root.innerHTML;

    const markers = await attached(root);

    expect(highlighted()).toEqual([DEW_POINT, PRESSURE]);
    expect(root.innerHTML).toBe(before);
    const content = root.getBoundingClientRect();
    for (const [index, quote] of [DEW_POINT, PRESSURE].entries()) {
      const line = [...CSS.highlights.get(HIGHLIGHT)!][index]!.getClientRects()[0]!;
      const marker = markers[index]!.getBoundingClientRect();
      expect(marker.left, quote).toBeGreaterThanOrEqual(content.right);
      expect(Math.abs((marker.top + marker.bottom) / 2 - (line.top + line.bottom) / 2), quote).toBeLessThanOrEqual(1);
    }
    expect(markers.every((marker) => marker.closest("[data-print-hide]"))).toBe(true);

    detach!();
    detach = undefined;

    expect(document.querySelector(".sv-annotations-marker")).toBeNull();
    expect(CSS.highlights.has(HIGHLIGHT)).toBe(false);
    expect(root.innerHTML).toBe(before);
  });

  it("opens each comment from the keyboard, with its author and its text, and returns focus on Escape", async () => {
    const [dewPoint, pressure] = await attached();
    expect(dewPoint!.getAttribute("aria-label")).toBe(`Comment by Ada Lovelace on “${DEW_POINT}”`);

    dewPoint!.focus();
    await userEvent.keyboard("{Enter}");

    const ada = document.getElementById(dewPoint!.getAttribute("popovertarget")!)!;
    expect(ada.matches(":popover-open")).toBe(true);
    expect(ada.getAttribute("aria-label")).toBe("Comment by Ada Lovelace");
    expect(ada.closest("[data-print-hide]")).not.toBeNull();
    // Beside the marker, in the margin.
    expect(ada.getBoundingClientRect().left).toBeGreaterThan(dewPoint!.getBoundingClientRect().right);
    expect(ada.querySelector("img")?.getAttribute("src")).toBe(ADA.avatarUrl);
    expect(ada.querySelector<HTMLAnchorElement>(".sv-annotations-name")?.href).toBe("https://github.com/ada");
    expect(ada.querySelector(".sv-annotations-handle")?.textContent).toBe("@ada");
    const link = ada.querySelector<HTMLAnchorElement>(".sv-annotations-body a")!;
    expect([link.href, link.textContent]).toEqual(["https://en.wikipedia.org/wiki/Dew_point", "https://en.wikipedia.org/wiki/Dew_point"]);

    await userEvent.keyboard("{Escape}");
    expect(ada.matches(":popover-open")).toBe(false);
    expect(document.activeElement).toBe(dewPoint);

    pressure!.focus();
    await userEvent.keyboard("{Enter}");

    // Google gives no picture, handle or profile page.
    const grace = document.getElementById(pressure!.getAttribute("popovertarget")!)!;
    expect(grace.querySelector("img")).toBeNull();
    expect(grace.querySelector(".sv-annotations-avatar")?.textContent).toBe("GH");
    expect(grace.querySelector(".sv-annotations-handle")).toBeNull();
    expect(grace.querySelector(".sv-annotations-name")?.tagName).toBe("SPAN");
    // A comment is text, whatever it looks like.
    expect(grace.querySelector(".sv-annotations-body")?.textContent).toBe("<b>Is</b> the 42 m measured at the sensor?");
    expect(grace.querySelector(".sv-annotations-body b")).toBeNull();
  });

  it("keeps markers that share a line apart when the margin pushes them on screen", async () => {
    await page.viewport(390, 800);
    const root = render();
    // A second comment on the same line as the pressure one.
    await commands.seedComments([
      { id: "pressure", page: "hardware/sensors", author: GRACE, anchor: anchorOf(root, PRESSURE), createdAt: "2026-11-03T09:00:00.000Z", body: "Which model?" },
      { id: "bmp390", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, "BMP390"), createdAt: "2026-11-05T09:00:00.000Z", body: "Same as mine." },
    ]);
    detach = attach(root, { endpoint: ENDPOINT, page: "hardware/sensors" });
    await expect.poll(() => document.querySelectorAll(".sv-annotations-marker").length).toBe(2);
    const [first, second] = [...document.querySelectorAll<HTMLButtonElement>(".sv-annotations-marker")].map((marker) => marker.getBoundingClientRect());

    expect(first!.top).toBe(second!.top);
    // Side by side and both on screen: neither covers the other, so each can be tapped.
    expect(second!.left).toBeGreaterThanOrEqual(first!.right);
    expect(second!.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
  });

  it("keeps markers and an open card on screen at phone width", async () => {
    await page.viewport(390, 800);
    const [dewPoint] = await attached();

    await userEvent.click(dewPoint!);

    const card = document.getElementById(dewPoint!.getAttribute("popovertarget")!)!;
    const width = document.documentElement.clientWidth;
    expect(dewPoint!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(card.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(card.getBoundingClientRect().top).toBeGreaterThan(dewPoint!.getBoundingClientRect().bottom);
  });
});

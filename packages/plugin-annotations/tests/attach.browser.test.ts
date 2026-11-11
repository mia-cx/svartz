import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { mount as mountSignIn } from "@svartz/auth/browser";
import "../src/browser.css";
// The body of vaults/showcase/hardware/sensors.md as theme-minimal renders it.
import note from "./fixtures/sensors.html?raw";
import { describe as describeRange, rangeOf } from "../src/anchor";
import { ACTIVE_HIGHLIGHT, attach, HIGHLIGHT } from "../src/browser";
import { ADA, ENDPOINT, GRACE, type SeedComment } from "./data";

declare module "vitest/browser" {
  interface BrowserCommands {
    seedComments(comments: SeedComment[]): Promise<void>;
    /** Sign the browser in as Ada at `origin`, as GitHub sending her back would; `null` signs it out. */
    signIn(origin: string | null): Promise<void>;
  }
}

const DEW_POINT = "Combined with temperature it gives the dew point";
const PRESSURE = "Bosch BMP390";

let detach: (() => void) | undefined;
let unmountSignIn: (() => void) | undefined;

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
  unmountSignIn?.();
  unmountSignIn = undefined;
  getSelection()?.removeAllRanges();
  sessionStorage.clear();
  document.body.innerHTML = "";
  await commands.signIn(null);
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

  it("keeps highlighting a note whose comments arrive after another note detaches", async () => {
    document.body.innerHTML = `<main>${note}</main><aside>${note}</aside>`;
    const [first, second] = [...document.querySelectorAll("article")] as HTMLElement[];
    // Hold the second note's response until the first has detached.
    const realFetch = globalThis.fetch;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    globalThis.fetch = async (...args) => {
      if (++calls === 2) await held;
      return realFetch(...args);
    };
    try {
      const detachFirst = attach(first!, { endpoint: ENDPOINT, page: "hardware/sensors" });
      await expect.poll(() => first!.nextElementSibling?.querySelectorAll(".sv-annotations-marker").length).toBe(2);
      detach = attach(second!, { endpoint: ENDPOINT, page: "hardware/sensors" });

      detachFirst();
      release();
      await expect.poll(() => second!.nextElementSibling?.querySelectorAll(".sv-annotations-marker").length).toBe(2);

      expect(highlighted().sort()).toEqual([DEW_POINT, PRESSURE].sort());
      detach();
      detach = undefined;
      expect(CSS.highlights.has(HIGHLIGHT)).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
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

describe("commenting on a selection", () => {
  const SHADE = "It needs shade and airflow";

  /** Select `range` as a reader would, and wait for the toolbar it brings up. */
  async function select(range: Range) {
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    await expect.poll(() => document.querySelector(".sv-annotations-toolbar:popover-open")).not.toBeNull();
    return document.querySelector<HTMLElement>(".sv-annotations-toolbar")!;
  }

  const composer = () => document.querySelector<HTMLFormElement>(".sv-annotations-composer")!;
  const active = () => [...CSS.highlights.get(ACTIVE_HIGHLIGHT) ?? []].map((range) => range.toString());

  it("takes a signed-out reader's comment through sign-in and posts it beside its passage", async () => {
    unmountSignIn = mountSignIn(location.pathname, { endpoint: "/notes/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
    let root = render();
    await attached(root);
    const start = root.textContent!.indexOf(SHADE);

    const toolbar = await select(rangeOf(root, { start, end: start + SHADE.length }));

    // Still a plain selection, so copying works, with the toolbar above it.
    expect(getSelection()!.toString()).toBe(SHADE);
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getBoundingClientRect().bottom).toBeLessThanOrEqual(getSelection()!.getRangeAt(0).getClientRects()[0]!.top);

    // Keyboard only: Tab reaches the toolbar, Enter opens the composer on the passage.
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement?.textContent).toBe("Comment");
    await userEvent.keyboard("{Enter}");
    expect(composer().matches(":popover-open")).toBe(true);
    expect(composer().getAttribute("aria-label")).toBe(`Comment on “${SHADE}”`);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Comment");
    expect(active()).toEqual([SHADE]);
    await userEvent.keyboard("Mine sits under the eaves.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    // Signed out: sign-in, returning here.
    await expect.poll(() => document.querySelector<HTMLDialogElement>("dialog.sv-auth")?.open).toBe(true);
    expect(document.querySelector(".sv-auth-provider")?.getAttribute("href"))
      .toBe(`/notes/_svartz/auth/start/github/?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`);

    // GitHub signs the reader in and sends them back: a fresh page, with the composer open on the same passage.
    await commands.signIn(location.origin);
    detach!();
    root = render();
    detach = attach(root, { endpoint: ENDPOINT, page: "hardware/sensors" });
    expect(composer().matches(":popover-open")).toBe(true);
    expect(composer().querySelector("textarea")!.value).toBe("Mine sits under the eaves.");
    expect(active()).toEqual([SHADE]);

    await userEvent.click(composer().querySelector<HTMLButtonElement>("button[type=submit]")!);

    await expect.poll(() => document.querySelectorAll(".sv-annotations-marker").length).toBe(3);
    expect(composer().matches(":popover-open")).toBe(false);
    expect(highlighted()).toContain(SHADE);
    const posted = document.activeElement as HTMLButtonElement;
    expect(posted.getAttribute("aria-label")).toBe(`Comment by Ada Lovelace on “${SHADE}”`);
    // Beside its passage's line, in the margin.
    const line = [...CSS.highlights.get(HIGHLIGHT)!].find((range) => range.toString() === SHADE)!.getClientRects()[0]!;
    const marker = posted.getBoundingClientRect();
    expect(marker.left).toBeGreaterThanOrEqual(root.getBoundingClientRect().right);
    expect(Math.abs((marker.top + marker.bottom) / 2 - (line.top + line.bottom) / 2)).toBeLessThanOrEqual(1);
    await userEvent.keyboard("{Enter}");
    expect(document.getElementById(posted.getAttribute("popovertarget")!)?.querySelector(".sv-annotations-body")?.textContent)
      .toBe("Mine sits under the eaves.");
    // Posted, so nothing reopens on the next visit.
    expect(sessionStorage.length).toBe(0);
  });

  it("keeps the draft and says why when the site refuses it", async () => {
    await commands.signIn(location.origin);
    const root = render();
    await attached(root);
    const whole = document.createRange();
    whole.selectNodeContents(root);
    expect(whole.toString().length).toBeGreaterThan(1000);

    await select(whole);
    await userEvent.click(document.querySelector(".sv-annotations-action")!);
    await userEvent.keyboard("All of it.");
    await userEvent.click(composer().querySelector<HTMLButtonElement>("button[type=submit]")!);

    const problem = composer().querySelector("[role=alert]")!;
    await expect.poll(() => problem.textContent).toBe("Select up to 1,000 characters to respond to.");
    expect(composer().matches(":popover-open")).toBe(true);
    expect(composer().querySelector("textarea")!.value).toBe("All of it.");
    expect(document.querySelectorAll(".sv-annotations-marker")).toHaveLength(2);
  });
});

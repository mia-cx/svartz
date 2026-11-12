import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { mount as mountSignIn } from "@svartz/auth/browser";
import "../src/browser.css";
// The body of vaults/showcase/hardware/sensors.md as theme-minimal renders it.
import note from "./fixtures/sensors.html?raw";
import { describe as describeRange, rangeOf } from "../src/anchor";
import { ACTIVE_HIGHLIGHT, attach, HIGHLIGHT } from "../src/browser";
import type { Identity } from "@svartz/auth";
import { ADA, ALAN, ENDPOINT, GRACE, type SeedComment } from "./data";

declare module "vitest/browser" {
  interface BrowserCommands {
    seedComments(comments: SeedComment[]): Promise<void>;
    /** Sign the browser in as `person` (Ada by default) at `origin`, as GitHub sending them back would; `null` signs it out. */
    signIn(origin: string | null, person?: Identity): Promise<void>;
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

  it("lets Tab leave the toolbar after the first one brings focus to it", async () => {
    const root = render();
    const [dewPoint, pressure] = await attached(root);
    const start = root.textContent!.indexOf(SHADE);
    await select(rangeOf(root, { start, end: start + SHADE.length }));

    await userEvent.keyboard("{Tab}");
    expect(document.activeElement?.textContent).toBe("Comment");
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(dewPoint);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(pressure);
  });

  it("shows the rate-limit wait in the composer and cards without losing the draft or comment", async () => {
    await commands.signIn(location.origin);
    const root = render();
    const [dewPoint] = await attached(root);
    // Spend the default 30-write budget through the real server; retries count too.
    for (let index = 0; index < 30; index++) {
      const response = await fetch(`${ENDPOINT}/pressure/agree/`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agreed: true }),
      });
      expect(response.status).toBe(200);
    }
    const start = root.textContent!.indexOf(SHADE);
    await select(rangeOf(root, { start, end: start + SHADE.length }));
    await userEvent.click(document.querySelector(".sv-annotations-action")!);
    await userEvent.keyboard("Mine sits under the eaves.");
    await userEvent.click(composer().querySelector<HTMLButtonElement>("button[type=submit]")!);

    // A real clock may cross the first second while the 30 writes finish.
    const message = /^You've sent too many annotations\. Try again in (1 hour|60 minutes)\.$/;
    await expect.poll(() => composer().querySelector("[role=alert]")?.textContent).toMatch(message);
    expect(composer().matches(":popover-open")).toBe(true);
    expect(composer().querySelector("textarea")!.value).toBe("Mine sits under the eaves.");
    expect(composer().querySelector("textarea")!.readOnly).toBe(false);
    dewPoint!.focus();
    await userEvent.keyboard("{Enter}");
    const card = document.getElementById(dewPoint!.getAttribute("popovertarget")!)!;
    await userEvent.click(card.querySelector<HTMLButtonElement>(".sv-annotations-agree")!);
    await expect.poll(() => card.querySelector("[role=alert]")?.textContent).toMatch(message);
    expect(card.querySelector(".sv-annotations-agree")?.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(card.querySelector<HTMLButtonElement>(".sv-annotations-delete")!);
    await userEvent.click(card.querySelector<HTMLButtonElement>(".sv-annotations-danger")!);
    await expect.poll(() => card.querySelector(".sv-annotations-confirm")?.getAttribute("aria-busy")).toBeNull();
    expect(card.querySelector("[role=alert]")?.textContent).toMatch(message);
    expect(card.matches(":popover-open")).toBe(true);
    expect(composer().querySelector("textarea")!.value).toBe("Mine sits under the eaves.");
    expect(document.querySelectorAll(".sv-annotations-marker")).toHaveLength(2);
  });

  it("holds the draft as it was sent until the site answers", async () => {
    await commands.signIn(location.origin);
    const root = render();
    await attached(root);
    const realFetch = globalThis.fetch;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = async (input, init) => {
      if (init?.method === "POST") await held;
      return realFetch(input, init);
    };
    try {
      const start = root.textContent!.indexOf(SHADE);
      await select(rangeOf(root, { start, end: start + SHADE.length }));
      await userEvent.click(document.querySelector(".sv-annotations-action")!);
      await userEvent.keyboard("Mine sits under the eaves.");
      await userEvent.click(composer().querySelector<HTMLButtonElement>("button[type=submit]")!);
      const input = composer().querySelector("textarea")!;
      expect(composer().getAttribute("aria-busy")).toBe("true");

      // While it posts, the draft can't change or be thrown away, so the answer can't land on a different one.
      await userEvent.click(input);
      await userEvent.keyboard(" Edited.");
      expect(input.value).toBe("Mine sits under the eaves.");
      composer().querySelector<HTMLButtonElement>("button[type=button]")!.click();
      await userEvent.keyboard("{Escape}");
      expect(composer().matches(":popover-open")).toBe(true);
      const other = root.textContent!.indexOf(PRESSURE);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(rangeOf(root, { start: other, end: other + PRESSURE.length }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(document.querySelector(".sv-annotations-toolbar:popover-open")).toBeNull();

      release();
      await expect.poll(() => document.querySelectorAll(".sv-annotations-marker").length).toBe(3);
      expect(composer().matches(":popover-open")).toBe(false);
      expect(input.readOnly).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("shows a comment once when it is posted before the page's comments load", async () => {
    await commands.signIn(location.origin);
    const root = render();
    // Back from signing in with a draft, posted before the list arrives; the list then includes it too.
    sessionStorage.setItem("svartz-annotations:draft", JSON.stringify({
      endpoint: ENDPOINT, page: "hardware/sensors", action: "comment", anchor: anchorOf(root, SHADE), body: "Mine sits under the eaves.",
    }));
    const realFetch = globalThis.fetch;
    let posted!: () => void;
    const stored = new Promise<void>((resolve) => { posted = resolve; });
    globalThis.fetch = async (input, init) => {
      if (init?.method !== "POST") await stored;
      const response = await realFetch(input, init);
      if (init?.method === "POST") posted();
      return response;
    };
    try {
      detach = attach(root, { endpoint: ENDPOINT, page: "hardware/sensors" });
      await userEvent.click(composer().querySelector<HTMLButtonElement>("button[type=submit]")!);

      await expect.poll(() => document.querySelector(`[aria-label="Comment by Ada Lovelace on “${DEW_POINT}”"]`)).not.toBeNull();
      expect([...document.querySelectorAll(".sv-annotations-marker")].map((marker) => marker.getAttribute("aria-label")))
        .toEqual([`Comment by Ada Lovelace on “${SHADE}”`, `Comment by Ada Lovelace on “${DEW_POINT}”`, `Comment by Grace Hopper on “${PRESSURE}”`]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("agreeing with a comment", () => {
  /** Open the pressure comment's card from the keyboard and Tab to its +1, as a keyboard reader would. */
  async function plusOne() {
    const [, pressure] = await attached();
    pressure!.focus();
    await userEvent.keyboard("{Enter}");
    const card = document.getElementById(pressure!.getAttribute("popovertarget")!)!;
    await userEvent.keyboard("{Tab}");
    const toggle = card.querySelector<HTMLButtonElement>(".sv-annotations-agree")!;
    expect(document.activeElement).toBe(toggle);
    return { card, toggle, agreed: () => card.querySelector(".sv-annotations-names")!.textContent };
  }

  beforeEach(async () => {
    const root = render();
    await commands.seedComments([
      { id: "pressure", page: "hardware/sensors", author: GRACE, anchor: anchorOf(root, PRESSURE), createdAt: "2026-11-03T09:00:00.000Z", body: "Which model?", agreedBy: [GRACE] },
      { id: "dew-point", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, DEW_POINT), createdAt: "2026-11-02T09:00:00.000Z", body: "Every morning." },
    ]);
  });

  it("toggles the reader's +1 from the keyboard and the mouse, showing the count and who agrees", async () => {
    await commands.signIn(location.origin);
    const { toggle, agreed } = await plusOne();

    await expect.element(toggle).toHaveAccessibleName("+1 1");
    await expect.element(toggle).toHaveAccessibleDescription("Grace Hopper agrees");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await userEvent.keyboard(" ");

    await expect.poll(() => toggle.getAttribute("aria-pressed")).toBe("true");
    await expect.element(toggle).toHaveAccessibleName("+1 2");
    expect(agreed()).toBe("You and Grace Hopper agree");
    expect(document.activeElement).toBe(toggle);

    await userEvent.click(toggle);

    await expect.poll(() => toggle.getAttribute("aria-pressed")).toBe("false");
    expect(agreed()).toBe("Grace Hopper agrees");

    await userEvent.keyboard("{Enter}");
    await expect.poll(() => toggle.getAttribute("aria-pressed")).toBe("true");
    // Stored: a fresh page shows the +1 as the reader's.
    detach!();
    const again = await plusOne();
    expect(again.toggle.getAttribute("aria-pressed")).toBe("true");
    expect(again.agreed()).toBe("You and Grace Hopper agree");
  });

  it("takes a signed-out reader's +1 through sign-in and applies it on return", async () => {
    unmountSignIn = mountSignIn(location.pathname, { endpoint: "/notes/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
    const { toggle } = await plusOne();

    await userEvent.keyboard(" ");

    await expect.poll(() => document.querySelector<HTMLDialogElement>("dialog.sv-auth")?.open).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    // GitHub signs the reader in and sends them back: the card opens with their +1 applied and focused.
    await commands.signIn(location.origin);
    detach!();
    detach = attach(render(), { endpoint: ENDPOINT, page: "hardware/sensors" });

    await expect.poll(() => document.querySelector(".sv-annotations-card:popover-open .sv-annotations-agree[aria-pressed=true]")).not.toBeNull();
    const card = document.querySelector<HTMLElement>(".sv-annotations-card:popover-open")!;
    expect(card.getAttribute("aria-label")).toBe("Comment by Grace Hopper");
    expect(document.activeElement).toBe(card.querySelector(".sv-annotations-agree"));
    expect(card.querySelector(".sv-annotations-names")!.textContent).toBe("You and Grace Hopper agree");
    expect(sessionStorage.length).toBe(0);
  });

  it("brings a signed-out reader back to the +1 when they close sign-in", async () => {
    unmountSignIn = mountSignIn(location.pathname, { endpoint: "/notes/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
    const { card, toggle } = await plusOne();

    await userEvent.keyboard(" ");
    await expect.poll(() => document.querySelector<HTMLDialogElement>("dialog.sv-auth")?.open).toBe(true);
    await userEvent.keyboard("{Escape}");

    expect(document.querySelector("dialog.sv-auth")).toBeNull();
    expect(card.matches(":popover-open")).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("locks the +1 while it saves, so a second press can't race the first", async () => {
    await commands.signIn(location.origin);
    const realFetch = globalThis.fetch;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    globalThis.fetch = async (input, init) => {
      if (init?.method === "POST") {
        posts++;
        await held;
      }
      return realFetch(input, init);
    };
    try {
      const { toggle, agreed } = await plusOne();

      await userEvent.click(toggle);
      expect(toggle.getAttribute("aria-busy")).toBe("true");
      await userEvent.click(toggle);
      await userEvent.keyboard(" ");
      release();

      await expect.poll(() => toggle.getAttribute("aria-busy")).toBeNull();
      expect(posts).toBe(1);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(agreed()).toBe("You and Grace Hopper agree");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("deleting a comment", () => {
  const BMP390 = "BMP390";

  beforeEach(async () => {
    const root = render();
    // Ada's comment, Grace's, and Ada's again on the same line as Grace's.
    await commands.seedComments([
      { id: "dew-point", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, DEW_POINT), createdAt: "2026-11-02T09:00:00.000Z", body: "Every morning.", agreedBy: [GRACE] },
      { id: "pressure", page: "hardware/sensors", author: GRACE, anchor: anchorOf(root, PRESSURE), createdAt: "2026-11-03T09:00:00.000Z", body: "Which model?" },
      { id: "bmp390", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, BMP390), createdAt: "2026-11-05T09:00:00.000Z", body: "Same as mine." },
    ]);
  });

  async function markers(count = 3) {
    await expect.poll(() => document.querySelectorAll(".sv-annotations-marker").length).toBe(count);
    return [...document.querySelectorAll<HTMLButtonElement>(".sv-annotations-marker")];
  }
  const cardOf = (marker: HTMLButtonElement) => document.getElementById(marker.getAttribute("popovertarget")!)!;
  const deleteOf = (marker: HTMLButtonElement) => cardOf(marker).querySelector<HTMLButtonElement>(".sv-annotations-delete")!;
  const confirmOf = (marker: HTMLButtonElement) => cardOf(marker).querySelector<HTMLElement>(".sv-annotations-confirm")!;
  const confirmButton = (marker: HTMLButtonElement) => [...confirmOf(marker).querySelectorAll("button")].find((button) => button.textContent === "Delete comment")!;
  const reattach = () => {
    detach?.();
    detach = attach(render(), { endpoint: ENDPOINT, page: "hardware/sensors" });
  };

  it("is offered on the reader's own comments only, and to no one signed out", async () => {
    reattach();
    expect((await markers()).map((marker) => deleteOf(marker).hidden)).toEqual([true, true, true]);

    await commands.signIn(location.origin);
    reattach();

    expect((await markers()).map((marker) => deleteOf(marker).hidden)).toEqual([false, true, false]);
  });

  it("deletes the reader's comment from the keyboard after they confirm, taking its marker and highlight with it", async () => {
    await commands.signIn(location.origin);
    reattach();
    const [dewPoint, pressure] = await markers();

    dewPoint!.focus();
    await userEvent.keyboard("{Enter}");
    // Ada's name, then +1, then Delete.
    await userEvent.keyboard("{Tab}{Tab}{Tab}");
    expect(document.activeElement).toBe(deleteOf(dewPoint!));
    await expect.element(deleteOf(dewPoint!)).toHaveAccessibleName("Delete comment");

    // Asking first, with Cancel focused, so a second Enter can't delete.
    await userEvent.keyboard("{Enter}");
    expect(confirmOf(dewPoint!).hidden).toBe(false);
    await expect.element(confirmOf(dewPoint!)).toHaveAccessibleName("Delete your comment?");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await userEvent.keyboard("{Enter}");
    expect(confirmOf(dewPoint!).hidden).toBe(true);
    expect(document.activeElement).toBe(deleteOf(dewPoint!));
    expect(highlighted()).toEqual([DEW_POINT, PRESSURE, BMP390]);

    await userEvent.keyboard("{Enter}{Tab}");
    expect(document.activeElement).toBe(confirmButton(dewPoint!));
    await userEvent.keyboard("{Enter}");

    await markers(2);
    expect(dewPoint!.isConnected).toBe(false);
    expect(highlighted()).toEqual([PRESSURE, BMP390]);
    expect(CSS.highlights.has(ACTIVE_HIGHLIGHT)).toBe(false);
    // Focus moves on to the next comment, and a screen reader hears it went.
    expect(document.activeElement).toBe(pressure);
    expect(document.querySelector(".sv-annotations [role=status]")?.textContent).toBe("Comment deleted.");

    // Gone for good: a fresh page doesn't show it.
    reattach();
    expect((await markers(2)).map((marker) => marker.getAttribute("aria-label"))).toEqual([
      `Comment by Grace Hopper on “${PRESSURE}”`, `Comment by Ada Lovelace on “${BMP390}”`,
    ]);
  });

  it("hands focus to the note when the page's last comment is deleted", async () => {
    const root = render();
    await commands.seedComments([
      { id: "dew-point", page: "hardware/sensors", author: ADA, anchor: anchorOf(root, DEW_POINT), createdAt: "2026-11-02T09:00:00.000Z", body: "Every morning." },
    ]);
    await commands.signIn(location.origin);
    reattach();
    const [only] = await markers(1);

    only!.focus();
    await userEvent.keyboard("{Enter}{Tab}{Tab}{Tab}{Enter}{Tab}{Enter}");

    await markers(0);
    const note = document.querySelector("article")!;
    expect(document.activeElement).toBe(note);
    // Focusable only while it holds focus; the note's markup is left as written.
    only!.blur();
    note.blur();
    expect(note.hasAttribute("tabindex")).toBe(false);
  });

  it("lets a moderator delete anyone's comment with the mouse, closing up the markers left on its line", async () => {
    await commands.signIn(location.origin, ALAN);
    reattach();
    const [, pressure, bmp390] = await markers();
    expect([...document.querySelectorAll<HTMLButtonElement>(".sv-annotations-marker")].map((marker) => deleteOf(marker).hidden)).toEqual([false, false, false]);
    const first = pressure!.getBoundingClientRect();
    expect(bmp390!.getBoundingClientRect().top).toBe(first.top);

    await userEvent.click(pressure!);
    await userEvent.click(deleteOf(pressure!));
    await expect.element(confirmOf(pressure!)).toHaveAccessibleName("Delete Grace Hopper's comment?");
    await userEvent.click(confirmButton(pressure!));

    await markers(2);
    expect(highlighted()).toEqual([DEW_POINT, BMP390]);
    expect(bmp390!.getBoundingClientRect().left).toBe(first.left);
  });

  it("locks the confirmation while the delete is sent, so it's sent once", async () => {
    await commands.signIn(location.origin);
    const realFetch = globalThis.fetch;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let deletes = 0;
    globalThis.fetch = async (input, init) => {
      if (init?.method === "DELETE") {
        deletes++;
        await held;
      }
      return realFetch(input, init);
    };
    try {
      reattach();
      const [dewPoint] = await markers();
      await userEvent.click(dewPoint!);
      await userEvent.click(deleteOf(dewPoint!));
      await userEvent.click(confirmButton(dewPoint!));
      expect(confirmOf(dewPoint!).getAttribute("aria-busy")).toBe("true");

      await userEvent.click(confirmButton(dewPoint!));
      // Playwright won't press an aria-disabled button, so press it as a script would.
      confirmOf(dewPoint!).querySelector("button")!.click();
      expect(confirmOf(dewPoint!).hidden).toBe(false);
      release();

      await markers(2);
      expect(deletes).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("keeps the comment and says why when the site refuses", async () => {
    await commands.signIn(location.origin);
    reattach();
    const [dewPoint] = await markers();
    // The session ends while the page is open.
    await commands.signIn(null);

    await userEvent.click(dewPoint!);
    await userEvent.click(deleteOf(dewPoint!));
    await userEvent.click(confirmButton(dewPoint!));

    const problem = cardOf(dewPoint!).querySelector("[role=alert]")!;
    await expect.poll(() => problem.textContent).toBe("Sign in to delete a comment.");
    expect(confirmOf(dewPoint!).hidden).toBe(false);
    expect(document.activeElement).toBe(confirmButton(dewPoint!));
    expect(document.querySelectorAll(".sv-annotations-marker")).toHaveLength(3);
  });

  it("takes away a comment someone else deleted first", async () => {
    await commands.signIn(location.origin);
    reattach();
    const [dewPoint] = await markers();
    // A moderator deletes Ada's comment while her page is open.
    const root = document.querySelector("article") as HTMLElement;
    await commands.seedComments([{ id: "pressure", page: "hardware/sensors", author: GRACE, anchor: anchorOf(root, PRESSURE), createdAt: "2026-11-03T09:00:00.000Z", body: "Which model?" }]);
    await commands.signIn(location.origin);

    await userEvent.click(dewPoint!);
    await userEvent.click(deleteOf(dewPoint!));
    await userEvent.click(confirmButton(dewPoint!));

    await markers(2);
    expect(highlighted()).toEqual([PRESSURE, BMP390]);
  });

  it("keeps a deleted comment away when the page's list answers after it went", async () => {
    await commands.signIn(location.origin);
    const root = render();
    const SHADE = "It needs shade and airflow";
    // Back from signing in with a draft, posted and deleted before the page's list arrives; the list still has it.
    sessionStorage.setItem("svartz-annotations:draft", JSON.stringify({
      endpoint: ENDPOINT, page: "hardware/sensors", action: "comment", anchor: anchorOf(root, SHADE), body: "Mine sits under the eaves.",
    }));
    const realFetch = globalThis.fetch;
    let posted!: () => void;
    let removed!: () => void;
    const afterPost = new Promise<void>((resolve) => { posted = resolve; });
    const afterDelete = new Promise<void>((resolve) => { removed = resolve; });
    globalThis.fetch = async (input, init) => {
      if (!init?.method) {
        await afterPost;
        const list = await realFetch(input, init);
        await afterDelete;
        return list;
      }
      const response = await realFetch(input, init);
      if (init.method === "POST") posted();
      if (init.method === "DELETE") removed();
      return response;
    };
    try {
      detach = attach(root, { endpoint: ENDPOINT, page: "hardware/sensors" });
      await userEvent.click(document.querySelector<HTMLButtonElement>(".sv-annotations-composer button[type=submit]")!);
      const [mine] = await markers(1);
      await userEvent.click(mine!);
      await userEvent.click(deleteOf(mine!));
      await userEvent.click(confirmButton(mine!));

      // The list, read before the delete, still has it; it stays away.
      await markers(3);
      expect(highlighted()).toEqual([DEW_POINT, PRESSURE, BMP390]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

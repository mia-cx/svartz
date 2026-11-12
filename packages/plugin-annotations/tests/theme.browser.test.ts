/**
 * A theme-minimal site with the plugin enabled: the runtime mounts the plugin's browser resource after every
 * navigation, through core's real `mountBrowserScripts`, on pages whose note body theme-minimal marks with
 * `data-svartz-note`.
 */
import { mountBrowserScripts } from "@svartz/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import "../src/browser.css";
// The body of vaults/showcase/hardware/sensors.md as theme-minimal renders it.
import sensors from "./fixtures/sensors.html?raw";
import { describe as describeRange, rangeOf } from "../src/anchor";
import { HIGHLIGHT } from "../src/browser";
import { ADA } from "./data";

// The site is served under the deployment base `/notes` with the vault at its root, so the endpoint is ENDPOINT.
const CONTEXT = { base: "/notes" };
const RESOURCE = { id: "annotations", load: () => import("../src/browser"), options: { endpoint: "/_svartz/annotations" } };

const DEW_POINT = "Combined with temperature it gives the dew point";
const SHADE = "It needs shade and airflow";
const GUSTS = "Gusts are the peak over three seconds";

const PAGES: Record<string, string> = {
  "/notes/hardware/sensors/": sensors.replace('<article class="sv-prose">', '<article class="sv-prose" data-svartz-note="hardware/sensors">'),
  "/notes/hardware/wind/": `<article class="sv-prose" data-svartz-note="hardware/wind"><p>The cups turn with the wind. ${GUSTS}, as the Met Office reports them.</p></article>`,
  // A list page: links to notes, no note body.
  "/notes/tags/hardware/": '<ul><li><a href="/notes/hardware/sensors/">Sensors</a></li><li><a href="/notes/hardware/wind/">Wind</a></li></ul>',
};

let dispose: (() => void) | undefined;

/** Render `pathname` and mount the plugin, as a client-side navigation does: the old page's cleanup runs first. */
async function navigate(pathname: string) {
  dispose?.();
  document.body.innerHTML = `<main style="max-inline-size: 42rem; margin: 2rem auto; padding-inline: 1rem; font: 16px/1.6 system-ui">${PAGES[pathname]}</main>`;
  dispose = await mountBrowserScripts([RESOURCE], pathname, CONTEXT);
}

const note = () => document.querySelector<HTMLElement>("[data-svartz-note]")!;
const markers = () => [...document.querySelectorAll<HTMLButtonElement>(".sv-annotations-marker")];
const highlighted = () => [...CSS.highlights.get(HIGHLIGHT) ?? []].map((range) => range.toString());

/** Select `quote` in the note and post `body` on it from the toolbar, waiting for its marker. */
async function comment(quote: string, body: string) {
  const root = note();
  const start = root.textContent!.indexOf(quote);
  const count = markers().length;
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(rangeOf(root, { start, end: start + quote.length }));
  await expect.element(page.getByRole("button", { name: "Comment", exact: true })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Comment", exact: true }));
  await userEvent.keyboard(body);
  await userEvent.click(page.getByRole("button", { name: "Post comment" }));
  await expect.poll(() => markers().length).toBe(count + 1);
}

beforeEach(async () => {
  document.body.innerHTML = `<main>${PAGES["/notes/hardware/sensors/"]}</main>`;
  const root = note();
  const start = root.textContent!.indexOf(DEW_POINT);
  await commands.seedComments([{
    id: "dew-point", page: "hardware/sensors", author: ADA, createdAt: "2026-11-02T09:00:00.000Z", body: "I check it every morning.",
    anchor: describeRange(root, rangeOf(root, { start, end: start + DEW_POINT.length })),
  }]);
  await commands.signIn(location.origin);
  await page.viewport(1440, 900);
});

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
  await commands.signIn(null);
});

it("comments on a note, follows the reader to the next note and comments there, without leftovers", async () => {
  await navigate("/notes/hardware/sensors/");
  await expect.poll(() => highlighted()).toEqual([DEW_POINT]);

  await comment(SHADE, "Mine sits under the eaves.");
  expect(highlighted()).toEqual([DEW_POINT, SHADE]);

  await navigate("/notes/hardware/wind/");
  // The first note's markers, cards, toolbar and highlights went with it; the second has no comments yet.
  expect(document.querySelectorAll(".sv-annotations")).toHaveLength(1);
  expect(markers()).toEqual([]);
  expect(CSS.highlights.has(HIGHLIGHT)).toBe(false);

  await comment(GUSTS, "Mine reports a ten-minute average.");
  expect(highlighted()).toEqual([GUSTS]);
  expect(markers()[0]!.getAttribute("aria-label")).toBe(`Comment by Ada Lovelace on “${GUSTS}”`);

  // Back again: both comments on the first note, stored under its slug, each shown once.
  await navigate("/notes/hardware/sensors/");
  await expect.poll(() => highlighted()).toEqual([DEW_POINT, SHADE]);
  expect(markers()).toHaveLength(2);
  expect(document.querySelectorAll(".sv-annotations")).toHaveLength(1);
});

it("adds nothing to a page without a note body", async () => {
  await navigate("/notes/tags/hardware/");

  expect(dispose).toBeTypeOf("function");
  expect(document.querySelector(".sv-annotations")).toBeNull();
  // Selecting text there offers no toolbar: nothing listens.
  getSelection()!.selectAllChildren(document.querySelector("ul")!);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(document.querySelector(".sv-annotations-toolbar")).toBeNull();
  expect(CSS.highlights.has(HIGHLIGHT)).toBe(false);
});

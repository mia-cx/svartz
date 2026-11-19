import "@svartz/auth/browser.css";
import "../src/browser.css";
import type { PageResult } from "@svartz/core";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import type { Viewer } from "./edits-harness";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** The page at `path` as the harness's `viewer` sees it, rendered by the dashboard over the seeded mirror; `null` for the 404. */
    editsPage(viewer: Viewer, path: string): Promise<PageResult | null>;
  }
}

const DASHBOARD = "/wiki/-/dashboard/";
const PANEL = `${DASHBOARD}submissions/recent-edits/`;
const REPO = "wikiplace/wikiplace.live";

/** Show what `viewer` gets at `path` as the theme shell would, and answer whether there was a page at all. */
async function open(viewer: Viewer, path: string): Promise<boolean> {
  const result = await commands.editsPage(viewer, path);
  if (!result || "redirect" in result) return false;
  document.body.innerHTML = `<main>${result.html}</main>`;
  return true;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Recent edits", () => {
  // Proves the gate: a viewer holding submissions:pull-requests:read finds the panel on the dashboard and opens it; others get neither.
  it("shows only to viewers who may see submissions", async () => {
    expect(await open("mod", DASHBOARD)).toBe(true);
    await expect.element(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Recent edits" })).toHaveAttribute("href", PANEL);
    expect(await open("mod", PANEL)).toBe(true);
    await expect.element(page.getByRole("heading", { level: 1, name: "Recent edits" })).toBeVisible();

    expect(await open("reader", DASHBOARD)).toBe(false);
    expect(await open("reader", PANEL)).toBe(false);
  });

  // Proves the listing: every commit newest first, with who made it, the pages it changed, its diff and its deploy state.
  it("lists each commit with its author, pages, diff and deploy state", async () => {
    await open("mod", PANEL);
    const entries = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Diff on GitHub" }) });
    expect(entries.elements().map((entry) => entry.querySelector("p")!.textContent)).toEqual([
      expect.stringMatching(/^Commit [0-9a-f]{7}$/),
      "Link every person, place and event",
      "Rewrite the guide",
      "Fix a typo in Setup",
      "Edit content/Places/Paris.md",
      "Edit content/guide.md",
    ]);

    const site = entries.nth(5);
    await expect.element(site).toHaveTextContent(/Ada Lovelace @ada/);
    await expect.element(site.getByText("Live", { exact: true })).toBeVisible();
    await expect.element(site.getByRole("link", { name: "Guide" })).toHaveAttribute("href", "/wiki/guide/");
    await expect.element(site.getByRole("link", { name: "Diff on GitHub" }))
      .toHaveAttribute("href", `https://github.com/${REPO}/commit/c0ffee5b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b`);
    await expect.element(site.getByRole("link", { name: "Diff on GitHub" })).toHaveAccessibleDescription("Edit content/guide.md");

    const forged = entries.nth(2);
    await expect.element(forged.getByRole("link", { name: "mallory" })).toHaveAttribute("href", "https://github.com/mallory");
    await expect.element(forged).not.toHaveTextContent(/Ada Lovelace/);
    await expect.element(forged.getByText("Building", { exact: true })).toBeVisible();

    const many = entries.nth(1);
    await expect.element(many.getByText("Build failed", { exact: true })).toBeVisible();
    expect(many.getByRole("link").elements().filter((link) => link.checkVisibility()).map((link) => link.textContent)).toEqual([
      "Expo", "Ada Lovelace", "Charles Babbage", "London", "Paris", "grace-gh", "Diff on GitHub",
    ]);
    await many.getByText("3 more").click();
    await expect.element(many.getByRole("link", { name: "Setup" })).toBeVisible();
    await expect.element(many.getByText("1 file the site doesn't publish")).toBeVisible();

    await expect.element(entries.nth(3).getByText("Not live yet", { exact: true })).toBeVisible();
  });

  // Proves the panel fits a phone without scrolling sideways.
  it("fits a phone-width screen", async () => {
    await page.viewport(360, 800);
    await open("mod", PANEL);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });
});

import "@svartz/auth/browser.css";
import "../src/browser.css";
import type { PageResult } from "@svartz/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import type { Viewer } from "./edits-harness";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** The page at `path` as the harness's `viewer` sees it, rendered by the dashboard over the seeded mirror; `null` for the 404. */
    editsPage(viewer: Viewer, path: string): Promise<PageResult | null>;
  }
}

const DASHBOARD = "/wiki/-/dashboard/";
const PANEL = `${DASHBOARD}submissions/review/`;

/** Show what `viewer` gets at `path` as the theme shell would, and answer whether there was a page at all. */
async function open(viewer: Viewer, path: string): Promise<boolean> {
  const result = await commands.editsPage(viewer, path);
  if (!result || "redirect" in result) return false;
  document.body.innerHTML = `<main>${result.html}</main>`;
  return true;
}

// The seeded site starts on the first page asked for, which takes longer than one test's budget on a busy CI runner.
beforeAll(() => commands.editsPage(null, DASHBOARD), 120_000);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the Submissions panel", () => {
  // Proves the gate in the browser: a reviewer finds the panel on the dashboard and opens it; a reader gets neither.
  it("shows only to reviewers", async () => {
    expect(await open("mod", DASHBOARD)).toBe(true);
    await expect.element(page.getByRole("link", { name: "Submissions", exact: true })).toHaveAttribute("href", PANEL);
    expect(await open("reader", DASHBOARD)).toBe(true);
    await expect.element(page.getByRole("link", { name: "Submissions", exact: true })).not.toBeInTheDocument();
    expect(await open("reader", PANEL)).toBe(false);
  });

  // Proves the journey to a review: from the list to a submission, a line picked for a comment, the page previewed,
  // and the decisions at hand.
  it("leads from the list to a submission's diff, preview and decisions", async () => {
    await open("mod", PANEL);
    const rows = page.getByRole("listitem");
    await expect.element(rows.nth(0)).toHaveTextContent(/Pull request #44.*by octocat on GitHub.*In review/);
    await expect.element(rows.nth(1).getByRole("link", { name: "Guide" })).toHaveAttribute("href", `${PANEL}43/`);

    await open("mod", `${PANEL}43/`);
    const line = page.getByRole("radio", { name: "Comment on line 7" });
    await line.click();
    await expect.element(line).toBeChecked();
    await page.getByLabelText("Comment on the line you picked").fill("Plant is right.");
    await expect.element(page.getByRole("button", { name: "Comment on line" })).toBeEnabled();

    await page.getByText("Preview", { exact: true }).click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Guide", exact: true })).toBeVisible();
    await expect.element(page.getByRole("paragraph").filter({ hasText: "Plant the wiki." })).toBeVisible();
    for (const name of ["Approve", "Request changes", "Merge", "Close without merging"]) {
      await expect.element(page.getByRole("button", { name })).toBeVisible();
    }
  });

  // Proves the list and a submission fit a phone without scrolling sideways.
  it.each([PANEL, `${PANEL}43/`])("fits %s on a phone-width screen", async (path) => {
    await page.viewport(360, 800);
    await open("mod", path);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });
});

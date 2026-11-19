import "../src/browser.css";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { mount } from "../src/browser";
import { diffLines } from "../src/diff";
import { changesPage, diffPage, historyPage, type Change } from "../src/pages";

const HISTORY = "/wiki/-/history/guide/";
const ADA = { kind: "account", name: "Ada Lovelace", handle: "ada" } as const;
const GRACE = { kind: "github", name: "Grace Hopper", login: "grace-hopper-with-a-long-github-login" } as const;
const CHANGES: Change[] = [
  { sha: "c".repeat(40), at: "2026-11-19T10:45:00Z", author: GRACE, summary: "Fix a typo in the section about setting up a wiki that runs on Cloudflare Workers" },
  { sha: "b".repeat(40), at: "2026-11-19T10:30:00Z", author: ADA, summary: "Added the time it takes." },
  { sha: "a".repeat(40), at: "2026-11-18T09:00:00Z", author: GRACE, summary: undefined },
];

function render(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;
}

const historyHtml = () => historyPage({
  title: "Guide",
  changes: CHANGES,
  unavailable: false,
  previousOf: (index) => CHANGES[index + 1]?.sha,
  links: { page: "/wiki/guide/", history: HISTORY, changes: "/wiki/-/changes/", older: `${HISTORY}?page=1` },
}).html;

afterEach(() => {
  document.body.innerHTML = "";
});

/** The page fits `width` without scrolling sideways, and every control is large enough to tap. */
async function fitsPhone(html: string, width = 360) {
  await page.viewport(width, 800);
  render(html);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  for (const target of document.querySelectorAll<HTMLElement>("button, input")) {
    expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(20);
  }
}

describe("a page's history", () => {
  // Proves a reader picks any two revisions from the keyboard and Compare asks for exactly that diff.
  it("compares the two revisions a reader picks", async () => {
    render(historyHtml());
    const form = document.querySelector("form")!;
    let asked: { path: string; query: Record<string, string> } | undefined;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      asked = { path: new URL(form.action).pathname, query: Object.fromEntries(new FormData(form)) as Record<string, string> };
    });

    await userEvent.click(page.getByRole("radio", { name: "Compare from 18 Nov 2026, 09:00 UTC" }));
    await userEvent.click(page.getByRole("radio", { name: "Compare to 19 Nov 2026, 10:45 UTC" }));
    await userEvent.click(page.getByRole("button", { name: "Compare selected" }));

    expect(asked).toEqual({ path: HISTORY, query: { from: "a".repeat(40), to: "c".repeat(40) } });
  });

  // Proves each change links to what it changed: the diff from the change before it.
  it("links each change to its diff against the one before", async () => {
    render(historyHtml());
    await expect.element(page.getByRole("link", { name: "19 Nov 2026, 10:45 UTC" }))
      .toHaveAttribute("href", `${HISTORY}?from=${"b".repeat(40)}&to=${"c".repeat(40)}`);
    await expect.element(page.getByRole("link", { name: "18 Nov 2026, 09:00 UTC" })).toHaveAttribute("href", `${HISTORY}?to=${"a".repeat(40)}`);
  });

  it("fits a phone-width screen", async () => {
    await fitsPhone(historyHtml());
  });
});

describe("the diff between two revisions", () => {
  // Proves a long line wraps instead of making a phone scroll sideways, and a change reads without colour.
  it("fits a phone-width screen, and marks each change in words", async () => {
    const long = "A paragraph with a very long line and a URL https://example.com/a/really/long/path/that/never/breaks/on/its/own/at/all";
    await fitsPhone(diffPage({
      title: "Guide",
      revisions: { from: CHANGES[1], to: CHANGES[0]! },
      comparison: { kind: "diff", hunks: diffLines("# Guide\n\nShort.\n", `# Guide\n\n${long}\n`)!, rendered: `<h1>Guide</h1><p>${long}</p>` },
      links: { page: "/wiki/guide/", history: HISTORY },
    }).html);
    await expect.element(page.getByRole("row", { name: /Removed Short\./ })).toBeVisible();
    await expect.element(page.getByRole("row", { name: /Added A paragraph/ })).toBeVisible();
  });
});

describe("Recent changes", () => {
  it("fits a phone-width screen", async () => {
    await fitsPhone(changesPage({
      unavailable: false,
      changes: CHANGES.map((change) => ({
        ...change,
        pages: [{ title: "A page with a rather long title about alliances", page: "/wiki/guide/", diff: `${HISTORY}?to=${change.sha}`, history: HISTORY }],
      })),
      older: `/wiki/-/changes/?before=${"a".repeat(40)}`,
    }).html);
  });
});

describe("the History action", () => {
  /** A note's page actions, with Edit already there, as the submissions plugin mounts it. */
  function actions() {
    document.body.innerHTML = '<div class="sv-page-actions"><span data-svartz-region="page-actions"><button type="button">Edit</button></span></div>';
    return document.querySelector('[data-svartz-region="page-actions"]')!;
  }

  // Proves History sits beside Edit on a page with a history, leads to it, and goes when the page does.
  it("joins Edit on a page with a history, and leaves with the page", async () => {
    const region = actions();
    const unmount = mount("/docs/wiki/caf%C3%A9/", { mountPath: "/wiki", pages: ["/wiki/café/"] }, { base: "/docs" });

    await expect.element(page.getByRole("link", { name: "History" })).toHaveAttribute("href", "/docs/wiki/-/history/caf%C3%A9/");
    expect([...region.children].map((child) => child.textContent)).toEqual(["Edit", "History"]);
    unmount?.();
    expect([...region.children].map((child) => child.textContent)).toEqual(["Edit"]);
  });

  // Proves a page whose address the browser escapes more than the index does still gets its action.
  it("finds a page whose address escapes a reserved character", async () => {
    actions();
    const unmount = mount("/wiki/notes%26tips/", { mountPath: "/wiki", pages: ["/wiki/notes&tips/"] });

    await expect.element(page.getByRole("link", { name: "History" })).toHaveAttribute("href", "/wiki/-/history/notes&tips/");
    unmount?.();
  });

  // Proves a page without a history, such as a protected one, gets no action.
  it("stays off pages without a history", () => {
    const region = actions();
    expect(mount("/wiki/secret/", { mountPath: "/wiki", pages: ["/wiki/guide/"] })).toBeUndefined();
    expect(region.children).toHaveLength(1);
  });
});

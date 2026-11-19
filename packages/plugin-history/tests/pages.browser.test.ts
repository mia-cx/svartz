import "../src/browser.css";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { mount } from "../src/browser";
import { diffLines } from "../src/diff";
import { changesPage, contributionsPage, contributionsSection, diffPage, historyPage, type Change, type Contributions } from "../src/pages";

const HISTORY = "/wiki/-/history/guide/";
const ADA = { kind: "account", name: "Ada Lovelace", handle: "ada", href: "/wiki/users/ada/" } as const;
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
  vi.unstubAllGlobals();
});

/** The page fits `width` without scrolling sideways, and every control is large enough to tap. */
async function fitsPhone(html: string, width = 360) {
  await page.viewport(width, 800);
  render(html);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  for (const target of document.querySelectorAll<HTMLElement>("button, input:not([type=hidden])")) {
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

describe("reverting a page", () => {
  const revertTo = (index: number) => (index === 0 ? undefined : `${HISTORY}?from=${CHANGES[index]!.sha}&to=${CHANGES[0]!.sha}#sv-history-revert`);
  const diffWithForm = () => diffPage({
    title: "Guide",
    revisions: { from: CHANGES[2], to: CHANGES[1]! },
    comparison: { kind: "diff", hunks: diffLines("# Guide\n\nShort.\n", "# Guide\n\nLonger.\n")!, rendered: "<h1>Guide</h1><p>Longer.</p>" },
    links: { page: "/wiki/guide/", history: HISTORY },
    revert: {
      action: "/wiki/_svartz/history/revert/",
      fields: { page: "/wiki/guide/", revision: CHANGES[2]!.sha, head: CHANGES[0]!.sha, to: CHANGES[1]!.sha },
      at: CHANGES[2]!.at,
      undone: 2,
      current: `${HISTORY}?from=${CHANGES[2]!.sha}&to=${CHANGES[0]!.sha}#sv-history-revert`,
      maxReason: 500,
    },
  }).html;

  // Proves a moderator reaches the revert form from every change but the newest, which is the page as it reads now.
  it("links every older change to its revert form", async () => {
    render(historyPage({
      title: "Guide",
      changes: CHANGES,
      unavailable: false,
      previousOf: (index) => CHANGES[index + 1]?.sha,
      revertTo,
      links: { page: "/wiki/guide/", history: HISTORY, changes: "/wiki/-/changes/" },
    }).html);

    expect(page.getByRole("link", { name: /^Revert to / }).elements()).toHaveLength(2);
    await expect.element(page.getByRole("link", { name: "Revert to 18 Nov 2026, 09:00 UTC" })).toHaveAttribute("href", revertTo(2));
  });

  // Proves the form says what it restores and undoes, and sends the revision, the head the moderator saw and the reason.
  it("sends the revision, the page's head and the reason from the diff's form", async () => {
    render(diffWithForm());
    const form = document.querySelector<HTMLFormElement>("form.sv-history-revert")!;
    let sent: Record<string, string> | undefined;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sent = Object.fromEntries(new FormData(form)) as Record<string, string>;
    });

    await expect.element(page.getByText("Restore the page as it read at 18 Nov 2026, 09:00 UTC, undoing 2 changes.")).toBeVisible();
    await userEvent.fill(page.getByRole("textbox", { name: "Reason (optional)" }), "Spam.");
    await userEvent.click(page.getByRole("button", { name: "Revert to this revision" }));

    expect(sent).toEqual({ page: "/wiki/guide/", revision: CHANGES[2]!.sha, head: CHANGES[0]!.sha, to: CHANGES[1]!.sha, reason: "Spam." });
  });

  it("fits a phone-width screen", async () => {
    await fitsPhone(historyPage({
      title: "Guide",
      changes: CHANGES,
      unavailable: false,
      previousOf: (index) => CHANGES[index + 1]?.sha,
      revertTo,
      status: "reverted",
      links: { page: "/wiki/guide/", history: HISTORY, changes: "/wiki/-/changes/" },
    }).html);
    await fitsPhone(diffPage({
      title: "Guide",
      revisions: { from: CHANGES[2], to: CHANGES[1]! },
      comparison: { kind: "hidden" },
      links: { page: "/wiki/guide/", history: HISTORY },
      status: "changed",
    }).html);
    await fitsPhone(diffWithForm());
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

/** Ada's contributions, with a long page title and a long summary, as a busy account's would read. */
const CONTRIBUTIONS: Contributions = {
  name: "Ada Lovelace",
  handle: "ada",
  reputation: { score: 12.5, next: { role: "editors", score: 20 } },
  changes: CHANGES.map((change) => ({
    ...change,
    pages: [{ title: "A page with a rather long title about alliances", page: "/wiki/guide/", diff: `${HISTORY}?to=${change.sha}`, history: HISTORY }],
  })),
  pages: [{ title: "A page with a rather long title about alliances", page: "/wiki/guide/" }, { title: "Setup", page: "/wiki/setup/" }],
};

describe("an account's contributions", () => {
  it("fits a phone-width screen", async () => {
    await fitsPhone(contributionsPage({ ...CONTRIBUTIONS, userPage: "/wiki/users/ada/", unavailable: false, older: `/wiki/-/contributions/ada/?before=${"a".repeat(40)}` }).html);
  });
});

describe("the contributions section", () => {
  const PAGES = ["/wiki/guide/", "/wiki/users/ada/"];
  const OPTIONS = { mountPath: "/wiki", pages: PAGES, userPages: "/wiki/users/" };

  /** A user page as the theme renders it: its note body, then what follows it. */
  function userPage() {
    document.body.innerHTML = '<main><article data-svartz-note="users/ada"><p>Hi, I am Ada.</p></article><footer>Previous and next</footer></main>';
  }

  // Proves a user page shows its account's contributions right after its note, from the server's section for that
  // page, and loses them with the page.
  it("shows below a user page's note, and leaves with the page", async () => {
    userPage();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(contributionsSection({ ...CONTRIBUTIONS, all: "/docs/wiki/-/contributions/ada/" }), { headers: { "content-type": "text/html" } });
    });

    const unmount = mount("/docs/wiki/users/ada/", OPTIONS, { base: "/docs" });

    await expect.element(page.getByRole("heading", { name: "Contributions", level: 2 })).toBeVisible();
    expect(asked).toEqual(["/docs/wiki/_svartz/history/contributions/?page=%2Fwiki%2Fusers%2Fada%2F"]);
    expect([...document.querySelector("main")!.children].map((child) => child.tagName)).toEqual(["ARTICLE", "SECTION", "FOOTER"]);
    await expect.element(page.getByRole("link", { name: "All contributions" })).toHaveAttribute("href", "/docs/wiki/-/contributions/ada/");
    unmount?.();
    expect(document.querySelector("section")).toBeNull();
  });

  // Proves the section doesn't depend on the page having a history: a user page in another note format asks for it too.
  it("asks for a user page that has no history of its own", async () => {
    userPage();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(contributionsSection({ ...CONTRIBUTIONS, all: "/wiki/-/contributions/ada/" }), { headers: { "content-type": "text/html" } });
    });

    const unmount = mount("/wiki/users/ada/", { ...OPTIONS, pages: ["/wiki/guide/"] });

    await expect.element(page.getByRole("heading", { name: "Contributions", level: 2 })).toBeVisible();
    expect(asked).toEqual(["/wiki/_svartz/history/contributions/?page=%2Fwiki%2Fusers%2Fada%2F"]);
    unmount?.();
  });

  // Proves a page outside the user page folder never asks for a section.
  it("stays off other pages", () => {
    userPage();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mount("/wiki/guide/", OPTIONS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fits a phone-width screen", async () => {
    await fitsPhone(`<article><p>Hi, I am Ada.</p></article>${contributionsSection({ ...CONTRIBUTIONS, all: "/wiki/-/contributions/ada/" })}`);
  });
});

describe("the account page's link to contributions", () => {
  // Proves the account page links the reader's contributions where auth leaves room for it.
  it("links the signed-in account's contributions", async () => {
    document.body.innerHTML = '<section><h2>Reputation</h2><p data-svartz-region="account-activity" data-svartz-handle="ada"></p></section>';

    const unmount = mount("/docs/wiki/-/account/", { mountPath: "/wiki", pages: [] }, { base: "/docs" });

    await expect.element(page.getByRole("link", { name: "Your contributions" })).toHaveAttribute("href", "/docs/wiki/-/contributions/ada/");
    unmount?.();
    expect(document.querySelector("a")).toBeNull();
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

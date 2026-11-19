/**
 * The account page's Create your page: auth's real `/-/account/` markup, filled by this plugin's real browser script,
 * opening the editor on the reader's own user page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import "../../auth/src/browser.css";
import "../src/browser.css";
import { accountPage, type AccountView } from "../../auth/src/account";
import { mount } from "../src/browser";
import { readDraft, storeDraft } from "../src/draft";

const GITHUB = { id: "github:583231", provider: "github", name: "Ada Lovelace", handle: "ada", linkedAt: "2026-11-01T10:00:00.000Z" } as const;
const OPTIONS = { endpoint: "/wiki/_svartz/submissions", pages: ["/wiki/guide/"], folders: [""] };

/** The account page as auth renders it for Ada, whose user page is `userPage`, with the site actions beside it. */
function render(userPage: AccountView["userPage"]) {
  const view: AccountView = {
    account: { id: "a1", handle: "ada", name: "Ada Lovelace", createdAt: "2026-11-01T10:00:00.000Z", roles: [], identity: GITHUB },
    standing: { score: 0 },
    identities: [GITHUB],
    sessions: [{ id: "s1", identity: GITHUB.id, provider: "github", createdAt: "2026-11-19T10:00:00.000Z" }],
    session: "s1",
    userPage,
    providers: ["github"],
    query: new URLSearchParams(),
    actions: {
      profile: "/wiki/_svartz/auth/account/profile/",
      unlink: "/wiki/_svartz/auth/account/unlink/",
      signOutEverywhere: "/wiki/_svartz/auth/account/sign-out-everywhere/",
      link: (provider) => `/wiki/_svartz/auth/account/link/${provider}/`,
    },
  };
  document.body.innerHTML = `<nav data-svartz-region="site-actions"></nav><main>${accountPage(view).html}</main>`;
  return mount("/docs/wiki/-/account/", OPTIONS, { base: "/docs" });
}

let unmount: (() => void) | void;

afterEach(() => {
  if (unmount) unmount();
  unmount = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Create your page", () => {
  it("starts the reader's own user page, its title and section fixed, and publishes it", async () => {
    const fetch = vi.fn(async (url: string) => url.includes("/destination/")
      ? Response.json({ destination: "commit" })
      : Response.json({ kind: "commit", url: "https://github.com/acme/wiki/commit/c0ffee", sha: "c0ffee" }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    unmount = render({ missing: "users/ada" });

    await page.getByRole("button", { name: "Create your page" }).click();
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("ada");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveAttribute("readonly");
    await expect.element(page.getByRole("combobox", { name: "Section" })).toHaveTextContent("users");
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveFocus();
    await page.getByRole("textbox", { name: "Page source" }).fill("# Ada Lovelace");
    await expect.element(page.getByRole("button", { name: "Publish" })).toHaveAccessibleDescription("Goes live once the site rebuilds.");
    await page.getByRole("button", { name: "Publish" }).click();

    await expect.element(page.getByRole("link", { name: "View commit" })).toBeVisible();
    expect(fetch.mock.calls[0]![0]).toBe("/docs/wiki/_svartz/submissions/destination/?folder=users&title=ada");
    const [, sent] = fetch.mock.calls.find(([url]) => url.endsWith("/new/"))!;
    expect(JSON.parse(String((sent as RequestInit).body))).toMatchObject({ folder: "users", title: "ada", markdown: "# Ada Lovelace" });
  });

  it("keeps its draft apart from New page's, so neither restores the other's title", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ destination: "commit" })));
    const endpoint = `/docs${OPTIONS.endpoint}`;
    storeDraft(endpoint, { kind: "new", folders: [""] }, { kind: "new", folder: "", title: "Charles Babbage", markdown: "# Babbage", note: "", savedAt: 1 });
    unmount = render({ missing: "users/ada" });

    await page.getByRole("button", { name: "Create your page" }).click();
    await page.getByRole("textbox", { name: "Page source" }).fill("# Ada");
    await expect.element(page.getByRole("button", { name: "Restore page" })).not.toBeInTheDocument();
    await expect.poll(() => readDraft(endpoint, { kind: "new", folders: ["users"], title: "ada" })?.markdown).toBe("# Ada");
    expect(readDraft(endpoint, { kind: "new", folders: [""] })?.title).toBe("Charles Babbage");
  });

  it("offers nothing to create once the reader has a page, and links it", async () => {
    unmount = render({ href: "/docs/wiki/users/ada/" });

    await expect.element(page.getByRole("link", { name: "Your page" })).toHaveAttribute("href", "/docs/wiki/users/ada/");
    expect(document.body.textContent).not.toContain("Create your page");
  });

  it("fits a phone-width screen beside the name", async () => {
    await page.viewport(360, 800);
    unmount = render({ missing: "users/ada" });

    await expect.element(page.getByRole("button", { name: "Create your page" })).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });
});

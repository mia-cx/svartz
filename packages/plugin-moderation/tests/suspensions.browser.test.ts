import "@svartz/auth/browser.css";
import "../src/browser.css";
import type { Identity } from "@svartz/auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { mount } from "../src/browser";
import { ADA, ALAN, GRACE } from "./data";

declare module "vitest/browser" {
  interface BrowserCommands {
    resetSite(): Promise<void>;
    signInAs(origin: string, person: Identity | null): Promise<void>;
    pageAs(person: Identity, path: string): Promise<string | null>;
    postAs(person: Identity, path: string, form: Record<string, string>): Promise<number>;
  }
}

const SUSPENSIONS = "/notes/-/dashboard/moderation/suspensions/";
const AUDIT = "/notes/-/dashboard/moderation/audit/";
const cleanups: Array<() => void> = [];

beforeEach(async () => {
  await commands.resetSite();
  await page.viewport(1280, 800);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

/** Show the page at `path` as `person` gets it, inside a main as the theme shell renders it; `false` for the 404. */
async function open(person: Identity, path: string): Promise<boolean> {
  const html = await commands.pageAs(person, path);
  if (html === null) return false;
  document.body.innerHTML = `<main style="padding: 16px">${html}</main>`;
  return true;
}

const suspendGrace = (reason = "Spammed the garden with links.") =>
  commands.postAs(ALAN, "/notes/_svartz/moderation/accounts/suspend/", { handle: "grace", duration: "week", reason, returnTo: SUSPENSIONS });

/** No page scrolls sideways, and every control is large enough to tap; a radio is tapped through its label's row. */
function fitsPhone() {
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  for (const target of document.querySelectorAll<HTMLElement>("button, input:not([type=radio], [type=hidden]), textarea,.sv-account-button, .sv-moderation-choice")) {
    expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(24);
  }
}

describe("the Suspend action on a user page", () => {
  /** Grace's user page, with its page actions as theme-minimal renders them, and the moderation script mounted on it. */
  function gracePage() {
    document.body.innerHTML = `<main><h1>grace</h1><div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div><article data-svartz-note="users/grace"><p>Hi.</p></article></main>`;
    cleanups.push(mount("/notes/users/grace/", { mountPath: "/notes", userPages: "users" }));
  }

  // Proves who gets the action and where it leads: the form for this account, coming back to this page.
  it("leads a moderator who may suspend to the form, and offers a reader only Report", async () => {
    await commands.signInAs(location.origin, ALAN);
    gracePage();

    const suspend = page.getByRole("link", { name: "Suspend" });
    await expect.element(suspend).toBeVisible();
    const href = new URL(suspend.element().getAttribute("href")!, location.origin);
    expect([href.pathname, href.searchParams.get("handle"), href.searchParams.get("returnTo")]).toEqual([SUSPENSIONS, "grace", `${location.pathname}${location.search}`]);
    for (const cleanup of cleanups.splice(0)) cleanup();

    await commands.signInAs(location.origin, ADA);
    gracePage();
    await expect.element(page.getByRole("button", { name: "Report" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(page.getByRole("link", { name: "Suspend" }).elements()).toHaveLength(0);
  });
});

describe("the suspension form", () => {
  it("asks how long and why, telling the moderator the account reads the reason", async () => {
    expect(await open(ADA, `${SUSPENSIONS}?handle=grace`)).toBe(false);
    expect(await open(ALAN, `${SUSPENSIONS}?handle=grace&returnTo=%2Fnotes%2Fusers%2Fgrace%2F`)).toBe(true);

    await expect.element(page.getByRole("heading", { name: "Suspend @grace" })).toBeVisible();
    await expect.element(page.getByRole("group", { name: "For how long" }).getByRole("radio", { name: "1 day" })).toBeChecked();
    await expect.element(page.getByRole("textbox", { name: "Reason" })).toHaveAccessibleDescription("@grace sees this reason.");
    await expect.element(page.getByRole("button", { name: "Suspend @grace" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/notes/users/grace/");
  });

  it("shows the suspension in force with Lift, and fits a phone-width screen", async () => {
    await suspendGrace();
    await page.viewport(360, 800);
    await open(ALAN, `${SUSPENSIONS}?handle=grace&status=suspended`);

    await expect.element(page.getByRole("status")).toHaveTextContent("@grace is suspended.");
    await expect.element(page.getByRole("heading", { name: /^Suspended until .+ UTC$/ })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Lift suspension" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Replace suspension" })).toBeVisible();
    fitsPhone();
  });
});

describe("the suspension notice", () => {
  it("tells the suspended person why and until when, and lets them sign out", async () => {
    await suspendGrace("Posted the same link on every page.");
    await page.viewport(360, 800);

    expect(await open(GRACE, "/notes/-/account/")).toBe(true);

    await expect.element(page.getByRole("heading", { name: /^Your account is suspended until \w{3} \d+, \d{4}, \d+:\d\d [AP]M UTC$/ })).toBeVisible();
    await expect.element(page.getByText("Posted the same link on every page.")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    fitsPhone();
  });
});

describe("the Audit log panel", () => {
  // Proves the panel gate in the browser: the log, with its filters, for who may read it; nothing for anyone else.
  it("shows the log with its filters to who may read it, and nothing to anyone else", async () => {
    await suspendGrace();

    expect(await open(ADA, AUDIT)).toBe(false);
    expect(await open(ALAN, AUDIT)).toBe(true);
    await expect.element(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect.element(page.getByRole("textbox", { name: "Who" })).toHaveAccessibleDescription("A handle, such as ada.");
    await expect.element(page.getByRole("textbox", { name: "On what" })).toBeVisible();
    await expect.element(page.getByText("auth:account:suspend")).toBeVisible();
    await expect.element(page.getByRole("link", { name: "@alan" })).toHaveAttribute("href", `${AUDIT}?actor=alan`);
    await expect.element(page.getByRole("link", { name: "account:grace" })).toHaveAttribute("href", `${AUDIT}?target=account%3Agrace`);
  });

  it("fits a phone-width screen, filtered", async () => {
    await suspendGrace("x".repeat(300));
    await page.viewport(360, 800);

    await open(ALAN, `${AUDIT}?actor=alan`);

    await expect.element(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
    fitsPhone();
  });
});

import "@svartz/auth/browser.css";
import "@svartz/plugin-annotations/browser.css";
import "../src/browser.css";
import type { Identity } from "@svartz/auth";
import { mount as mountSignIn } from "@svartz/auth/browser";
import { attach } from "@svartz/plugin-annotations/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { mount } from "../src/browser";
import { ADA, ALAN } from "./data";

declare module "vitest/browser" {
  interface BrowserCommands {
    resetSite(): Promise<void>;
    signInAs(origin: string, person: Identity | null): Promise<void>;
    storedReports(): Promise<Array<{ target_kind: string; target_id: string; reason: string }>>;
    reportsPanel(person: Identity): Promise<string | null>;
  }
}

const OPTIONS = { mountPath: "/notes", userPages: "users" };
const cleanups: Array<() => void> = [];

/** A note at `slug` with its page actions, as theme-minimal renders one, and both plugins' scripts mounted on it. */
function note(slug: string, text = "roses bloom in June.") {
  document.body.innerHTML = `<main><h1>Garden</h1><div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div><article data-svartz-note="${slug}"><p>${text}</p></article></main>`;
  cleanups.push(mountSignIn("/notes/", { endpoint: "/notes/_svartz/auth", mountPath: "/notes", providers: [{ id: "github", label: "GitHub" }] }));
  cleanups.push(mount(`/notes/${slug}/`, OPTIONS));
}

beforeEach(async () => {
  await commands.resetSite();
  await commands.signInAs(location.origin, ADA);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

describe("the Report action", () => {
  // Proves the report flow from a note: the action, the dialog, and a report that reaches the queue.
  it("reports the page from its page actions, and says the report went", async () => {
    note("garden");

    await page.getByRole("button", { name: "Report" }).click();

    const dialog = page.getByRole("dialog", { name: "Report page" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Garden")).toBeVisible();
    await expect.element(dialog.getByLabelText("What's wrong?")).toHaveFocus();
    await userEvent.keyboard("The intro was replaced with ads.");
    await dialog.getByRole("button", { name: "Send report" }).click();

    await expect.element(page.getByRole("status").getByText("Thanks. A moderator will look at it.")).toBeVisible();
    expect(await commands.storedReports()).toEqual([{ target_kind: "page", target_id: "garden", reason: "The intro was replaced with ads." }]);
    await page.getByRole("button", { name: "Close" }).click();
    expect(document.querySelector("dialog")).toBeNull();
    await expect.element(page.getByRole("button", { name: "Report" })).toHaveFocus();
  });

  it("asks for a reason before sending, in its own words", async () => {
    note("garden");
    await page.getByRole("button", { name: "Report" }).click();

    await page.getByRole("button", { name: "Send report" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("Say what's wrong before sending.");
    await expect.element(page.getByLabelText("What's wrong?")).toHaveAttribute("aria-invalid", "true");
    expect(await commands.storedReports()).toEqual([]);
  });

  it("on a user page, reports the page or its account", async () => {
    note("users/grace");
    await page.getByRole("button", { name: "Report" }).click();

    const dialog = page.getByRole("dialog", { name: "Report" });
    await expect.element(dialog.getByRole("radio", { name: "This page" })).toBeChecked();
    await dialog.getByRole("radio", { name: "@grace's account" }).click();
    await dialog.getByLabelText("What's wrong?").fill("Impersonating someone.");
    await dialog.getByRole("button", { name: "Send report" }).click();

    await expect.element(page.getByText("Report sent")).toBeVisible();
    expect(await commands.storedReports()).toEqual([{ target_kind: "account", target_id: "grace", reason: "Impersonating someone." }]);
  });

  // Proves the comment card's Report, which annotations renders and this script answers, files a comment report.
  it("reports a comment from its card, and gives the card back after", async () => {
    note("garden");
    const content = document.querySelector<HTMLElement>("[data-svartz-note]")!;
    cleanups.push(attach(content, { endpoint: "/notes/_svartz/annotations", page: "garden", report: true }));
    await page.getByRole("button", { name: /Comment by Grace Hopper/ }).click();

    await page.getByRole("button", { name: "Report comment" }).click();

    const dialog = page.getByRole("dialog", { name: "Report comment" });
    await expect.element(dialog.getByText("Comment by Grace Hopper")).toBeVisible();
    await dialog.getByLabelText("What's wrong?").fill("Spam link.");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    expect(await commands.storedReports()).toEqual([{ target_kind: "annotation", target_id: "c1", reason: "Spam link." }]);
    await expect.element(page.getByRole("button", { name: "Report comment" })).toHaveFocus();
  });

  // Proves a host page with several notes: one click opens one dialog, from the instance of the note's own vault.
  it("on a host page with two vaults' notes, answers a comment's Report once, for its own vault", async () => {
    document.body.innerHTML = `<main><div data-svartz-note-content data-svartz-note="guide"><p>Read the guide.</p></div>
<div data-svartz-note-content data-svartz-note="garden"><p>roses bloom in June.</p></div></main>`;
    const [guide, garden] = document.querySelectorAll<HTMLElement>("[data-svartz-note]");
    cleanups.push(mountSignIn("/app/", { endpoint: "/notes/_svartz/auth", mountPath: "/notes", providers: [{ id: "github", label: "GitHub" }] }));
    // The docs vault's note comes first, so an instance ignoring its note would answer the garden comment too.
    cleanups.push(mount("/app/", { mountPath: "/docs", userPages: "users" }, { base: "", note: guide! }));
    cleanups.push(mount("/app/", OPTIONS, { base: "", note: garden! }));
    cleanups.push(attach(garden!, { endpoint: "/notes/_svartz/annotations", page: "garden", report: true }));
    await page.getByRole("button", { name: /Comment by Grace Hopper/ }).click();

    await page.getByRole("button", { name: "Report comment" }).click();

    const dialog = page.getByRole("dialog", { name: "Report comment" });
    await dialog.getByLabelText("What's wrong?").fill("Spam link.");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect.element(page.getByText("Report sent")).toBeVisible();
    expect(document.querySelectorAll("dialog.sv-moderation-dialog")).toHaveLength(1);
    expect(await commands.storedReports()).toEqual([{ target_kind: "annotation", target_id: "c1", reason: "Spam link." }]);
  });

  it("asks a signed-out reader to sign in first", async () => {
    await commands.signInAs(location.origin, null);
    note("garden");

    await page.getByRole("button", { name: "Report" }).click();

    await expect.element(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
    expect(document.querySelector("dialog.sv-moderation-dialog")).toBeNull();
  });

  it("takes its action and dialog away when the page goes", async () => {
    note("garden");
    await page.getByRole("button", { name: "Report" }).click();
    await expect.element(page.getByRole("dialog", { name: "Report page" })).toBeVisible();

    for (const cleanup of cleanups.splice(0)) cleanup();

    expect(document.querySelector('[data-svartz-region="page-actions"]')?.children).toHaveLength(0);
    expect(document.querySelector("dialog")).toBeNull();
  });
});

describe("the Reports panel", () => {
  /** Show the panel `person` gets as the theme shell would, and answer whether there was one. */
  async function open(person: Identity): Promise<boolean> {
    const html = await commands.reportsPanel(person);
    if (html === null) return false;
    document.body.innerHTML = `<main>${html}</main>`;
    return true;
  }

  // Proves the panel gate: a moderator gets the queue with the report, a reader gets the 404.
  it("shows the queue to a moderator and to nobody else", async () => {
    note("garden");
    await page.getByRole("button", { name: "Report" }).click();
    await page.getByLabelText("What's wrong?").fill("Vandalised.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect.element(page.getByText("Report sent")).toBeVisible();

    expect(await open(ADA)).toBe(false);
    expect(await open(ALAN)).toBe(true);
    await expect.element(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Open 1" })).toHaveAttribute("aria-current", "page");
    await expect.element(page.getByRole("link", { name: "Garden" })).toHaveAttribute("href", "/notes/garden/");
    await expect.element(page.getByText("Vandalised.")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Resolve" })).toHaveAccessibleDescription("Garden");
  });

  it("fits a phone-width screen, with targets large enough to tap", async () => {
    await page.viewport(360, 800);
    note("garden");
    const content = document.querySelector<HTMLElement>("[data-svartz-note]")!;
    cleanups.push(attach(content, { endpoint: "/notes/_svartz/annotations", page: "garden", report: true }));
    await page.getByRole("button", { name: /Comment by Grace Hopper/ }).click();
    await page.getByRole("button", { name: "Report comment" }).click();
    await page.getByLabelText("What's wrong?").fill("x".repeat(400));
    await page.getByRole("button", { name: "Send report" }).click();
    await expect.element(page.getByText("Report sent")).toBeVisible();
    for (const cleanup of cleanups.splice(0)) cleanup();

    await open(ALAN);

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
    for (const target of document.querySelectorAll<HTMLElement>("button, nav a")) {
      expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(24);
    }
  });
});

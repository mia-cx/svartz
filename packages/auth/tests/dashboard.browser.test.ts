import "../src/browser.css";
import type { PageResult } from "@svartz/core";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { mount } from "../src/browser";
import type { Viewer } from "./dashboard-harness";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** The page at `path` as the harness's `viewer` sees it, rendered by the auth server on D1; `null` for the 404. */
    dashboardPage(viewer: Viewer, path: string): Promise<PageResult | null>;
    /** Give the test browser `viewer`'s session cookie at `origin`. */
    signInAs(origin: string, viewer: Viewer): Promise<void>;
  }
}

const DASHBOARD = "/notes/-/dashboard/";

/** Show what `viewer` gets at `path` as the theme shell would, and answer whether there was a page at all. */
async function open(viewer: Viewer, path: string): Promise<boolean> {
  const result = await commands.dashboardPage(viewer, path);
  if (!result || "redirect" in result) return false;
  document.body.innerHTML = `<main>${result.html}</main>`;
  return true;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the dashboard's gates", () => {
  // Proves the People & permissions gate: only a viewer holding auth:grants:read sees or opens it.
  it("shows People & permissions only to a viewer who may see people and permissions", async () => {
    expect(await open("root", DASHBOARD)).toBe(true);
    await expect.element(page.getByRole("link", { name: "People & permissions" })).toHaveAttribute("href", `${DASHBOARD}auth/people/`);

    expect(await open("mod", DASHBOARD)).toBe(true);
    await expect.element(page.getByRole("heading", { name: "Moderation" })).toBeVisible();
    expect(page.getByRole("link", { name: "People & permissions" }).elements()).toHaveLength(0);
    expect(await open("mod", `${DASHBOARD}auth/people/`)).toBe(false);
  });

  // Proves a plugin panel's gate: only a viewer holding its permission sees it, and someone with no panel gets no dashboard.
  it("shows a plugin's panel only to a viewer who holds its permission", async () => {
    expect(await open("mod", `${DASHBOARD}moderation/reports/`)).toBe(true);
    await expect.element(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect.element(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", DASHBOARD);

    expect(await open("reader", DASHBOARD)).toBe(false);
    expect(await open("reader", `${DASHBOARD}moderation/reports/`)).toBe(false);
  });
});

describe("People & permissions", () => {
  // Proves the panel's forms are reachable from the keyboard, under the names they show, in reading order.
  it("works from the keyboard, in order", async () => {
    await open("root", `${DASHBOARD}auth/people/`);
    (document.querySelector('a[href="#sv-dashboard-grants"]') as HTMLElement).focus();
    const names: string[] = [];
    for (let step = 0; step < 11; step++) {
      await userEvent.keyboard("{Tab}");
      const element = document.activeElement as HTMLElement;
      names.push(document.querySelector(`label[for="${element.id}"]`)?.textContent ?? element.getAttribute("aria-label") ?? element.textContent!.trim());
    }
    expect(names).toEqual([
      "Roles", "Check access", "People", "Permissions",
      "Grant to", "Handle, role or group name", "Permission", "Set to", "Where", "Folder or page", "Save grant",
    ]);
  });

  // Proves the panel fits a phone without scrolling sideways, with targets large enough to tap.
  it("fits a phone-width screen", async () => {
    await page.viewport(360, 800);
    await open("root", `${DASHBOARD}auth/people/`);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
    for (const target of document.querySelectorAll<HTMLElement>("button, input:not([type=hidden]), select")) {
      expect(target.getBoundingClientRect().height, target.outerHTML).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("the site's links", () => {
  // Proves a signed-in reader with a panel gets Account and Dashboard links in the site actions, for this vault.
  it("links a signed-in reader to their account and the dashboard", async () => {
    await commands.signInAs(location.origin, "mod");
    document.body.innerHTML = `<div data-svartz-region="site-actions"></div>`;

    const unmount = mount("/notes/", { endpoint: "/notes/_svartz/auth", mountPath: "/notes", providers: [] });

    const region = page.getByRole("link", { name: "Dashboard" });
    await expect.element(region).toHaveAttribute("href", DASHBOARD);
    await expect.element(page.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/notes/-/account/");
    unmount();
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});

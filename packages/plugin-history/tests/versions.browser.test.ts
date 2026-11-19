import "../src/browser.css";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { diffLines } from "../src/diff";
import { mount } from "../src/versions-browser";
import { versionPage, versionsPage, type Version } from "../src/versions-pages";

const LONG = "A summary long enough to wrap: it explains the change at length, with a-very-long-unbroken-identifier-that-would-otherwise-overflow-a-phone";
const VERSIONS: Version[] = [
  { at: "2026-11-19T10:45:00Z", author: "Grace Hopper", summary: LONG, href: "c0ffee1/" },
  { at: "2026-11-18T09:00:00Z", author: "Ada Lovelace", summary: undefined, href: "dec0de2/" },
];

function render(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a note's previous versions", () => {
  // Proves the listing and a version page read without sideways scrolling, on a desktop and on a phone.
  it.each([[1280], [360]])("fit a %ipx-wide screen", async (width) => {
    await page.viewport(width, 800);
    const listing = versionsPage({ title: "Hello", note: "../", versions: VERSIONS, max: 50 });
    render(listing.html);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    expect(page.getByRole("link", { name: "19 Nov 2026, 10:45 UTC" }).element().getAttribute("href")).toBe("c0ffee1/");

    const version = versionPage({
      title: "Hello",
      version: { ...VERSIONS[0]!, href: undefined },
      before: VERSIONS[1],
      hunks: diffLines("First wording.\n", `First wording, then ${"a-long-word-".repeat(12)}.\n`),
      rendered: `<p>First wording, then ${"a-long-word-".repeat(12)}.</p>`,
      links: { note: "../../", versions: "../", older: "../dec0de2/" },
    });
    render(version.html);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    expect(page.getByRole("link", { name: "Older version" }).element().getAttribute("href")).toBe("../dec0de2/");
  });

  // Proves a note with versions gets Previous versions in its page actions, linking its listing below the deployment
  // base, and a note without them gets nothing.
  it("adds Previous versions to the page actions of a note that has them", () => {
    document.body.innerHTML = '<div data-svartz-region="page-actions"></div>';
    const options = { pages: ["/posts/café/"] };

    expect(mount("/site/posts/other/", options, { base: "/site" })).toBeUndefined();
    const cleanup = mount("/site/posts/caf%C3%A9/", options, { base: "/site" });

    const link = page.getByRole("link", { name: "Previous versions" }).element() as HTMLAnchorElement;
    expect(new URL(link.href).pathname).toBe("/site/posts/caf%C3%A9/versions/");
    cleanup?.();
    expect(document.querySelector("a")).toBeNull();
  });
});

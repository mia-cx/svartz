import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../src/browser.css";
import type { BrowserOptions } from "../src/api";
import { mount } from "../src/browser";

// CRLF line endings and frontmatter: the edit must keep every byte it doesn't touch.
const SOURCE = "---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n";
const OPTIONS = { endpoint: "/wiki/_svartz/submissions", pages: ["/wiki/guide/"] };
const CONTEXT = { base: "/docs" };

let unmount: (() => void) | void;

/** The site's server: source for the guide, and `edit` for the pull request answer. */
function serve(edit: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes("/source/") ? Response.json({ markdown: SOURCE }) : edit());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function openEditor(options: BrowserOptions = OPTIONS) {
  unmount = mount("/docs/wiki/guide/", options, CONTEXT);
  await page.getByRole("button", { name: "Edit" }).click();
  const source = page.getByRole("textbox", { name: "Page source" });
  await expect.element(source).toHaveTextContent("# Guide");
  // Append at the end of the document.
  const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
  await source.click();
  await userEvent.keyboard(`{${mod}>}{End}{/${mod}}Welcome.`);
}

beforeEach(() => {
  document.body.innerHTML = '<div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div>';
});

afterEach(() => {
  if (unmount) unmount();
  vi.unstubAllGlobals();
});

describe("Edit", () => {
  it("submits the edited source and links the pull request", async () => {
    const fetch = serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await openEditor();
    await page.getByLabelText("What changed").fill("Greet readers.");
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("link", { name: "View pull request #7" }))
      .toHaveAttribute("href", "https://github.com/acme/wiki/pull/7");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/docs/wiki/_svartz/submissions/source/?page=%2Fwiki%2Fguide%2F",
      "/docs/wiki/_svartz/submissions/edit/",
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toEqual({
      page: "/wiki/guide/",
      markdown: `${SOURCE}Welcome.`,
      note: "Greet readers.",
    });
  });

  it("shows the server's message when the pull request can't be opened", async () => {
    const message = "GitHub rejected this site's token. Ask the site owner to renew it.";
    serve(() => Response.json({ error: "github_unauthorized", message }, { status: 502 }));
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent(message);
    await expect.element(page.getByRole("button", { name: "Open pull request" })).toBeEnabled();
  });

  it("holds the panel while the pull request opens, so it sends once and links what it sent", async () => {
    let answer!: (response: Response) => void;
    const fetch = serve(() => new Promise((resolve) => { answer = resolve; }));
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();

    const source = page.getByRole("textbox", { name: "Page source" });
    await source.click();
    await userEvent.keyboard(" Unsent.");
    await page.getByLabelText("What changed").click();
    await userEvent.keyboard("Unsent.");
    await expect.element(page.getByRole("button", { name: "Opening pull request…" })).toBeDisabled();

    answer(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect.element(source).not.toHaveTextContent("Unsent.");
  });

  it("sends the edit only once the Turnstile check passes, with its token", async () => {
    let token: string | undefined;
    vi.stubGlobal("turnstile", {
      render: (container: HTMLElement, { sitekey }: { sitekey: string }) => {
        container.dataset.sitekey = sitekey;
        return "widget-1";
      },
      getResponse: () => token,
      reset: () => {},
      remove: () => {},
    });
    const fetch = serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await openEditor({ ...OPTIONS, turnstileSiteKey: "0x4AAAAAAAtest" });
    expect(document.querySelector(".svartz-submissions-turnstile")).toHaveProperty("dataset.sitekey", "0x4AAAAAAAtest");

    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Finish the check that you're human, then open the pull request.");
    expect(fetch).toHaveBeenCalledTimes(1);

    token = "token-from-widget";
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toMatchObject({ turnstileToken: "token-from-widget" });
  });

  it("offers Edit when the URL percent-encodes the page's path", async () => {
    const fetch = serve(() => Response.json({}));
    unmount = mount("/docs/wiki/caf%C3%A9/", { ...OPTIONS, pages: ["/wiki/café/"] }, CONTEXT);
    await page.getByRole("button", { name: "Edit" }).click();

    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("# Guide");
    expect(fetch.mock.calls[0]![0]).toBe(`/docs/wiki/_svartz/submissions/source/?page=${encodeURIComponent("/wiki/café/")}`);
  });

  it.each([
    ["a page the build didn't make editable", "/docs/wiki/locked/"],
    ["a malformed escape", "/docs/wiki/caf%C3/"],
  ])("stays off %s", (_case, pathname) => {
    unmount = mount(pathname, OPTIONS, CONTEXT);

    expect(document.querySelector('[data-svartz-region="page-actions"]')?.children).toHaveLength(0);
  });
});

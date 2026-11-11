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
      submissionId: expect.stringMatching(/^[0-9a-f]{32}$/),
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

  it("stays open while the pull request opens, so the reader gets its link", async () => {
    let answer!: (response: Response) => void;
    serve(() => new Promise((resolve) => { answer = resolve; }));
    // A reader who would confirm discarding the edit.
    vi.stubGlobal("confirm", () => true);
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("button", { name: "Close editor" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeDisabled();

    answer(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Close editor" })).toBeEnabled();
  });

  it("sends the same submission id when the reader retries", async () => {
    const answers = [
      Response.json({ error: "github_failed", message: "GitHub answered 502. Try again in a moment." }, { status: 502 }),
      Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }),
    ];
    const fetch = serve(() => answers.shift()!);
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("GitHub answered 502.");
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    const [first, retry] = fetch.mock.calls.slice(1).map(([, init]) => JSON.parse(String(init!.body)).submissionId);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(retry).toBe(first);
  });

  it("retries under the same id after navigating away mid-send, and starts a new one once it lands", async () => {
    const answers: Array<Promise<Response>> = [
      new Promise(() => {}), // Lost: the reader navigated away before it answered.
      Promise.resolve(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 })),
      Promise.resolve(Response.json({ url: "https://github.com/acme/wiki/pull/8", number: 8 }, { status: 201 })),
    ];
    const fetch = serve(() => answers.shift()!);
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    // Navigation closes the panel without asking.
    if (unmount) unmount();

    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    if (unmount) unmount();
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #8" })).toBeVisible();

    const [lost, retry, next] = fetch.mock.calls
      .filter(([url]) => url.includes("/edit/"))
      .map(([, init]) => JSON.parse(String(init!.body)).submissionId);
    expect(retry).toBe(lost);
    expect(next).not.toBe(lost);
  });

  it("keeps the id when the pull request lands after navigation closed the panel", async () => {
    let land!: (response: Response) => void;
    const answers: Array<Promise<Response>> = [
      new Promise((resolve) => { land = resolve; }),
      // The server finds the pull request the first attempt opened.
      Promise.resolve(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 })),
    ];
    const fetch = serve(() => answers.shift()!);
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    if (unmount) unmount();
    // It succeeds, but the reader never saw the link.
    land(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    const [first, retry] = fetch.mock.calls
      .filter(([url]) => url.includes("/edit/"))
      .map(([, init]) => JSON.parse(String(init!.body)).submissionId);
    expect(retry).toBe(first);
  });

  it("opens no editor when the page unmounts while the editor loads", async () => {
    serve(() => Response.json({}));
    const cleanup = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    document.querySelector<HTMLButtonElement>('[data-svartz-region="page-actions"] button')!.click();
    cleanup!();
    // The click's import settles first; then the panel would have opened.
    await import("../src/editor");
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.querySelector("dialog")).toBeNull();
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

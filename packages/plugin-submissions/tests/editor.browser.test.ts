import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../src/browser.css";
import type { BrowserOptions } from "../src/api";
import { mount } from "../src/browser";
import { mount as mountAuth } from "@svartz/auth/browser";

// CRLF line endings and frontmatter: the edit must keep every byte it doesn't touch.
const SOURCE = "---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n";
const OPTIONS = { endpoint: "/wiki/_svartz/submissions", pages: ["/wiki/guide/"], folders: ["", "People"] };
const CONTEXT = { base: "/docs" };

let unmount: (() => void) | void;

/** The site's server: `source` for the guide's source, and `edit` for the pull request answer. */
function serve(edit: () => Response | Promise<Response>, source = () => Response.json({ markdown: SOURCE })) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => url.includes("/source/") ? source() : edit());
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
  document.body.innerHTML = '<nav data-svartz-region="site-actions"></nav><div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div>';
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

  it("sends edited text under a new id after a failure that may have opened a pull request", async () => {
    // The server may have opened a pull request with the first text before its answer was lost.
    const lost = () => Response.json({ error: "github_unavailable", message: "Couldn't reach GitHub right now." }, { status: 503 });
    const answers = [lost(), lost(), Response.json({ url: "https://github.com/acme/wiki/pull/8", number: 8 }, { status: 201 })];
    const fetch = serve(() => answers.shift()!);
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Couldn't reach GitHub");

    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard(" Edited.");
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("button", { name: "Open pull request" })).toBeEnabled();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #8" })).toBeVisible();

    const [original, edited, retry] = fetch.mock.calls
      .filter(([url]) => url.includes("/edit/"))
      .map(([, init]) => JSON.parse(String(init!.body)) as { submissionId: string; markdown: string });
    expect(edited!.markdown).not.toBe(original!.markdown);
    expect(edited!.submissionId).not.toBe(original!.submissionId);
    expect(retry).toEqual(edited);
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

describe("sign-in", () => {
  // Sign-in returns the reader to the page they left, so the panel is mounted on the test page's own path.
  const HERE = location.pathname;
  const SIGN_IN_OPTIONS = { ...OPTIONS, pages: [HERE] };
  const SIGNED_OUT = { error: "sign_in_required", message: "Sign in to send edits from this site, then open the pull request." };
  let unmountAuth: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    unmountAuth = mountAuth(HERE, { endpoint: "/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
  });

  afterEach(() => {
    unmountAuth?.();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  /** Leave for the provider and come back signed in: the page unmounts, then mounts afresh. */
  function returnFromSignIn() {
    if (unmount) unmount();
    document.querySelector("dialog.sv-auth")?.remove();
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
  }

  /** Open Edit on this page and add a word to the source. */
  async function writeEdit() {
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
    await page.getByRole("button", { name: "Edit" }).click();
    const source = page.getByRole("textbox", { name: "Page source" });
    await expect.element(source).toHaveTextContent("# Guide");
    await source.click();
    await userEvent.keyboard("Welcome.");
  }

  it("keeps an edit through the sign-in round trip and sends it once the reader is back", async () => {
    const answers = [Response.json(SIGNED_OUT, { status: 401 }), Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 })];
    const fetch = serve(() => answers.shift()!);
    await writeEdit();
    await page.getByLabelText("What changed").fill("Greet readers.");
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("link", { name: "Continue with GitHub" }))
      .toHaveAttribute("href", expect.stringContaining(`/_svartz/auth/start/github/?returnTo=${encodeURIComponent(HERE)}`));
    returnFromSignIn();

    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Welcome.");
    await expect.element(page.getByLabelText("What changed")).toHaveValue("Greet readers.");
    await expect.element(page.getByRole("button", { name: "Open pull request" })).toHaveFocus();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    const [signedOut, signedIn] = fetch.mock.calls.filter(([url]) => url.includes("/edit/")).map(([, init]) => JSON.parse(String(init!.body)));
    expect(signedIn).toMatchObject({ page: HERE, markdown: signedOut.markdown, note: "Greet readers." });
    expect(signedIn.markdown).toContain("Welcome.");
    expect(sessionStorage.length).toBe(0);
  });

  it("keeps a new page's title and section through the round trip", async () => {
    serve(() => Response.json(SIGNED_OUT, { status: 401 }));
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
    await page.getByRole("button", { name: "New page" }).click();
    await userEvent.keyboard("Ada Lovelace");
    await page.getByRole("combobox", { name: "Section" }).selectOptions("People");
    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard("# Ada Lovelace");
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();

    returnFromSignIn();

    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("Ada Lovelace");
    await expect.element(page.getByRole("combobox", { name: "Section" })).toHaveValue("People");
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("# Ada Lovelace");
    await expect.element(page.getByRole("button", { name: "Open pull request" })).toBeEnabled();
  });

  it("keeps the draft when the source fails to load after sign-in, so reopening the editor restores it", async () => {
    let sourceDown = false;
    serve(
      () => Response.json(SIGNED_OUT, { status: 401 }),
      () => sourceDown
        ? Response.json({ error: "github_unavailable", message: "Couldn't reach GitHub right now." }, { status: 503 })
        : Response.json({ markdown: SOURCE }),
    );
    await writeEdit();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();

    sourceDown = true;
    returnFromSignIn();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Couldn't reach GitHub right now.");
    await page.getByRole("button", { name: "Close editor" }).click();

    sourceDown = false;
    await page.getByRole("button", { name: "Edit" }).click();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Welcome.");
    expect(sessionStorage.length).toBe(0);
  });

  it("ignores a sign-in refusal that arrives after navigation closed the panel", async () => {
    let refuse!: (response: Response) => void;
    serve(() => new Promise((resolve) => { refuse = resolve; }));
    await writeEdit();
    await page.getByRole("button", { name: "Open pull request" }).click();
    // Navigation closes the panel before the server answers.
    if (unmount) unmount();
    refuse(Response.json(SIGNED_OUT, { status: 401 }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.querySelector("dialog.sv-auth")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("asks the reader to copy their changes when the browser can't keep them", async () => {
    serve(() => Response.json(SIGNED_OUT, { status: 401 }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    await writeEdit();
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("This browser can't keep your changes while you sign in, so copy them first.");
    expect(document.querySelector("dialog.sv-auth")).toBeNull();
    await page.getByRole("alert").getByRole("button", { name: "Sign in" }).click();
    await expect.element(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  });
});

describe("New page", () => {
  /** Open New page from any page, then fill the title, the section, and the page itself. */
  async function writeNewPage(options: BrowserOptions = OPTIONS) {
    unmount = mount("/docs/wiki/guide/", options, CONTEXT);
    await page.getByRole("button", { name: "New page" }).click();
    await expect.element(page.getByRole("heading", { name: "New page" })).toBeVisible();
    await expect.element(page.getByRole("combobox", { name: "Section" })).toHaveValue("");
    // The panel opens on the title, so the reader types it first.
    await userEvent.keyboard("Ada Lovelace");
    await page.getByRole("combobox", { name: "Section" }).selectOptions("People");
    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard("# Ada Lovelace");
  }

  it("lists the published sections and opens a pull request adding the page", async () => {
    const fetch = serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/9", number: 9 }, { status: 201 }));
    await writeNewPage();
    await expect.element(page.getByRole("combobox", { name: "Section" })).toHaveTextContent("Top levelPeople");
    await page.getByLabelText("Why add this page").fill("She deserves one.");
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("link", { name: "View pull request #9" }))
      .toHaveAttribute("href", "https://github.com/acme/wiki/pull/9");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/docs/wiki/_svartz/submissions/new/"]);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({
      submissionId: expect.stringMatching(/^[0-9a-f]{32}$/),
      folder: "People",
      title: "Ada Lovelace",
      markdown: "# Ada Lovelace",
      note: "She deserves one.",
    });
  });

  it("links the existing page when the title is taken", async () => {
    const message = "A page with this title already exists. Choose another title, or edit that page.";
    serve(() => Response.json({ error: "exists", message, existing: "https://wiki.example/docs/wiki/people/ada-lovelace/" }, { status: 409 }));
    await writeNewPage();
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent(message);
    await expect.element(page.getByRole("link", { name: "Open the existing page" }))
      .toHaveAttribute("href", "https://wiki.example/docs/wiki/people/ada-lovelace/");
    await expect.element(page.getByRole("textbox", { name: "Title" })).not.toHaveAttribute("readonly");
  });

  it.each([
    ["title", () => page.getByRole("textbox", { name: "Title" }).fill("Ada King")],
    ["section", () => page.getByRole("combobox", { name: "Section" }).selectOptions("Top level")],
  ])("drops the taken-title message once the reader changes the %s", async (_field, change) => {
    serve(() => Response.json({ error: "exists", message: "A page with this title already exists.", existing: "https://wiki.example/docs/wiki/people/ada-lovelace/" }, { status: 409 }));
    await writeNewPage();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "Open the existing page" })).toBeVisible();

    await change();

    await expect.element(page.getByRole("link", { name: "Open the existing page" })).not.toBeInTheDocument();
    expect(document.querySelector(".svartz-submissions-error")).toHaveProperty("hidden", true);
  });

  it("keeps an unanswered new page in one vault from reusing its id in another vault on the site", async () => {
    // The first vault's answer is lost: the reader navigated to the second vault before it came.
    const answers: Array<Promise<Response>> = [
      new Promise(() => {}),
      Promise.resolve(Response.json({ url: "https://github.com/acme/wiki/pull/9", number: 9 }, { status: 201 })),
    ];
    const fetch = serve(() => answers.shift()!);
    await writeNewPage();
    await page.getByRole("button", { name: "Open pull request" }).click();
    if (unmount) unmount();

    await writeNewPage({ ...OPTIONS, endpoint: "/notes/_svartz/submissions" });
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #9" })).toBeVisible();

    const [first, second] = fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).submissionId);
    expect(second).not.toBe(first);
  });

  it("waits for a title and some content before it can be sent", async () => {
    serve(() => Response.json({}));
    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "New page" }).click();
    const submit = page.getByRole("button", { name: "Open pull request" });

    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard("Some text.");
    await expect.element(submit).toBeDisabled();
    await page.getByRole("textbox", { name: "Title" }).fill("Notes");
    await expect.element(submit).toBeEnabled();
  });

  it("isn't offered when the site has no published section", () => {
    unmount = mount("/docs/wiki/guide/", { ...OPTIONS, folders: [] }, CONTEXT);

    expect(document.querySelector('[data-svartz-region="site-actions"]')?.children).toHaveLength(0);
  });
});

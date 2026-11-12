import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../src/browser.css";
import type { BrowserOptions } from "../src/api";
import { mount } from "../src/browser";
import { readDraft, storeDraft } from "../src/draft";
import { mount as mountAuth } from "@svartz/auth/browser";
import { renderPreview } from "@svartz/plugins/preview";
// The site's own renderer and theme-minimal's content components, as a theme page hands them to browser scripts.
import { svartzContentComponents } from "../../ui/src/lib/content/index";
import { resolveContentComponents } from "../../ui/src/lib/runtime/content-components";
import { mountContent } from "../../ui/src/lib/runtime/mount-content.svelte";

// CRLF line endings and frontmatter: the edit must keep every byte it doesn't touch.
const SOURCE = "---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n";
const OPTIONS = { endpoint: "/wiki/_svartz/submissions", pages: ["/wiki/guide/"], folders: ["", "People"] };
const CONTEXT = { base: "/docs" };

let unmount: (() => void) | void;

/** What the build lets a wikilink name: protected and hidden notes are never among them. */
const NOTES = [
  { link: "Ada Lovelace", title: "Ada Lovelace", slug: "ada-lovelace", path: "Ada Lovelace.md", href: "/wiki/ada-lovelace/" },
  { link: "People/Grace", title: "Grace Hopper", slug: "people/grace", path: "People/Grace.md", href: "/wiki/people/grace/" },
  { link: "Guide", title: "Guide", slug: "guide", path: "Guide.md", href: "/wiki/guide/" },
];
const LINKS = { notes: NOTES, linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] };

/** The site's server: `source` for the guide's source, `links/` for the notes, and `edit` for the pull request answer. */
function serve(edit: () => Response | Promise<Response>, source = () => Response.json({ markdown: SOURCE })) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes("/source/") ? source() : url.includes("/links/") ? Response.json(LINKS) : edit());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function openEditor(options: BrowserOptions = OPTIONS) {
  unmount = mount("/docs/wiki/guide/", options, CONTEXT);
  await page.getByRole("button", { name: "Edit" }).click();
  const source = page.getByRole("textbox", { name: "Page source" });
  await expect.element(source).toHaveTextContent("Guide");
  // Append at the end of the document.
  const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
  await source.click();
  await userEvent.keyboard(`{${mod}>}{End}{/${mod}}Welcome.`);
}

/** Reopen the editor on the guide and restore the edit navigation kept. */
async function restoreDraft() {
  unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Restore edit" }).click();
}

beforeEach(() => {
  document.body.innerHTML = '<nav data-svartz-region="site-actions"></nav><div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div>';
});

afterEach(() => {
  if (unmount) unmount();
  unmount = undefined;
  // Navigation keeps drafts, so each test starts with none.
  localStorage.clear();
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

    await restoreDraft();
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

    await restoreDraft();
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

    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Guide");
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
    localStorage.clear();
    unmountAuth = mountAuth(HERE, { endpoint: "/_svartz/auth", providers: [{ id: "github", label: "GitHub" }] });
  });

  afterEach(() => {
    unmountAuth?.();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /** Leave for the provider and come back signed in: the page unmounts, then mounts afresh. */
  function returnFromSignIn() {
    if (unmount) unmount();
    document.querySelector("dialog.sv-auth")?.remove();
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
  }

  /** Leave the page and come back: no sign-in is pending, so the panel stays shut until the reader opens it. */
  async function expectNoReopen() {
    if (unmount) unmount();
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
    await import("../src/editor");
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.querySelector("dialog.svartz-submissions")).toBeNull();
  }

  /** Open Edit on this page and add a word to the source. */
  async function writeEdit() {
    unmount = mount(HERE, SIGN_IN_OPTIONS, { base: "" });
    await page.getByRole("button", { name: "Edit" }).click();
    const source = page.getByRole("textbox", { name: "Page source" });
    await expect.element(source).toHaveTextContent("Guide");
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
    expect(localStorage.length).toBe(0);
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
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Ada Lovelace");
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
    await expectNoReopen();
  });

  it("offers the draft instead of reopening it when the page changed while the reader signed in", async () => {
    let markdown = SOURCE;
    serve(() => Response.json(SIGNED_OUT, { status: 401 }), () => Response.json({ markdown }));
    await writeEdit();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();

    markdown = `${SOURCE}Newer change.\r\n`;
    returnFromSignIn();
    await expect.element(page.getByRole("button", { name: "Restore anyway" })).toHaveFocus();
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
    await expectNoReopen();
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

/** The source's lines as they show, by line number from 1. */
const shownLine = (number: number) => document.querySelectorAll(".svartz-submissions .cm-line")[number - 1] as HTMLElement;

/** Put the cursor on `line` by clicking it; wrapped lines make arrow keys count rows, not lines. */
const cursorTo = (line: number) => userEvent.click(shownLine(line));

/** The Markdown the edit sent. */
function sentMarkdown(): string {
  const [, init] = vi.mocked(globalThis.fetch).mock.calls.find(([url]) => String(url).includes("/edit/"))!;
  return JSON.parse(String(init!.body)).markdown;
}

/** Open Edit on `markdown`, with the cursor on `line`. */
async function openOn(markdown: string, line = 1) {
  serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }), () => Response.json({ markdown }));
  unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
  await page.getByRole("button", { name: "Edit" }).click();
  const source = page.getByRole("textbox", { name: "Page source" });
  await expect.element(source).toBeVisible();
  await cursorTo(line);
  return source;
}

describe("Live Preview", () => {
  const NOTE = [
    "# Guide",
    "",
    "Some **bold**, *soft* and `code` text with [a link](https://example.com).",
    "",
    "See [[People/Ada Lovelace|Ada]] and ![[diagram.png]].",
    "",
    "> [!warning] Mind the gap",
    "> Inside the callout.",
    "",
    "- [ ] Write the page",
    "",
    "Read [the docs][docs].",
    "",
    "[docs]: https://example.com/docs",
  ].join("\n");

  it("shows Markdown formatted away from the cursor, and raw on the cursor's line", async () => {
    await openOn(NOTE, 1);

    expect(shownLine(1).textContent).toBe("# Guide");
    expect(shownLine(1).classList).toContain("cm-lp-h1");
    expect(shownLine(3).textContent).toBe("Some bold, soft and code text with a link.");
    expect(shownLine(3).querySelector(".cm-lp-strong")?.textContent).toBe("bold");
    expect(shownLine(5).textContent).toBe("See Ada and diagram.png.");
    expect(shownLine(5).querySelector(".cm-lp-embed")?.textContent).toBe("diagram.png");
    expect(shownLine(7).textContent).toBe("Warning Mind the gap");
    expect(shownLine(7).dataset.callout).toBe("warning");
    expect(shownLine(8).textContent).toBe("Inside the callout.");
    await expect.element(page.getByRole("checkbox", { name: "Done" })).not.toBeChecked();
    expect(shownLine(12).textContent).toBe("Read the docs.");
    // A reference definition is content, not syntax.
    expect(shownLine(14).textContent).toBe("[docs]: https://example.com/docs");

    await cursorTo(5);
    await expect.poll(() => shownLine(5).textContent).toBe("See [[People/Ada Lovelace|Ada]] and ![[diagram.png]].");
    expect(shownLine(1).textContent).toBe("Guide");
  });

  it("ticks a task from its checkbox", async () => {
    await openOn(NOTE, 1);
    await page.getByRole("checkbox", { name: "Done" }).click();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    expect(sentMarkdown()).toBe(NOTE.replace("- [ ]", "- [x]"));
  });

  it("opens a note whose link syntax spans lines, showing that syntax", async () => {
    await openOn('# Guide\n\n[link](https://example.com "Title\ncontinued")\n\nSee [[target\ncontinued|label]].\n', 1);

    expect(shownLine(3).textContent).toBe('link "Title');
    // A wikilink stays on one line, so Markdown reads only the inner brackets, as a link.
    expect(shownLine(7).textContent).toBe("continued|label].");
  });

  it("ticks a task from the keyboard, keeping focus on its checkbox", async () => {
    await openOn(NOTE, 1);
    await userEvent.tab();
    const box = page.getByRole("checkbox", { name: "Done" });
    await expect.element(box).toHaveFocus();
    await userEvent.keyboard(" ");

    await expect.element(box).toBeChecked();
    await expect.element(box).toHaveFocus();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    expect(sentMarkdown()).toBe(NOTE.replace("- [ ]", "- [x]"));
  });

  it("leaves tasks alone while the pull request opens", async () => {
    let answer!: (response: Response) => void;
    await openOn(NOTE, 1);
    await userEvent.keyboard("{End}!");
    serve(() => new Promise((resolve) => { answer = resolve; }), () => Response.json({ markdown: NOTE }));
    await page.getByRole("button", { name: "Open pull request" }).click();

    const box = page.getByRole("checkbox", { name: "Done" });
    await expect.element(box).toBeDisabled();
    // What a script or assistive technology could still send to it.
    box.element().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    (box.element() as HTMLInputElement).click();
    answer(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    await expect.element(box).not.toBeChecked();
    await expect.element(box).toBeDisabled();
    expect(sentMarkdown()).toBe(NOTE.replace("# Guide", "# Guide!"));
    await page.getByRole("radio", { name: "Source" }).click();
    expect(shownLine(10).textContent).toBe("- [ ] Write the page");
  });

  it("switches to Source and back without changing a byte, and remembers the choice", async () => {
    await openOn(SOURCE, 5);
    await userEvent.keyboard("{End} today");
    await page.getByRole("radio", { name: "Source" }).click();
    await cursorTo(1);
    expect(shownLine(5).textContent).toBe("# Guide today");
    await page.getByRole("radio", { name: "Live Preview" }).click();
    // Formatting follows the parser, which runs after the switch.
    await expect.poll(() => shownLine(5).textContent).toBe("Guide today");
    await page.getByRole("radio", { name: "Source" }).click();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();

    expect(sentMarkdown()).toBe(SOURCE.replace("# Guide", "# Guide today"));

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect.element(page.getByRole("radio", { name: "Source" })).toBeChecked();
  });

  it("switches modes from the keyboard", async () => {
    await openOn(SOURCE);
    await page.getByRole("radio", { name: "Live Preview" }).click();
    await userEvent.keyboard("{ArrowRight}");

    await expect.element(page.getByRole("radio", { name: "Source" })).toBeChecked();
    await expect.element(page.getByRole("group", { name: "Editor mode" })).toBeVisible();
  });
});

describe("drafts", () => {
  /** Write in the editor, pause long enough for the autosave, then lose the page without any cleanup, as a crash does. */
  async function writeThenCrash() {
    await openEditor();
    await page.getByLabelText("What changed").fill("Greet readers.");
    await new Promise((resolve) => setTimeout(resolve, 600));
    document.querySelector("dialog")?.remove();
    unmount = undefined;
    document.body.innerHTML = '<nav data-svartz-region="site-actions"></nav><div class="sv-page-actions"><span data-svartz-region="page-actions"></span></div>';
    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "Edit" }).click();
  }

  it("offers an unsent edit back after a crash, and restores it from the keyboard", async () => {
    serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await writeThenCrash();

    await expect.element(page.getByRole("group", { name: /^Unsent edit from / })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Restore edit" })).toHaveFocus();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).not.toHaveTextContent("Welcome.");
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Welcome.");
    await expect.element(page.getByLabelText("What changed")).toHaveValue("Greet readers.");
    await expect.element(page.getByRole("group", { name: /^Unsent edit/ })).not.toBeInTheDocument();
  });

  it("takes no new writing until the reader answers the offer, so none goes unsaved", async () => {
    serve(() => Response.json({}));
    await writeThenCrash();
    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard("Lost?");
    await page.getByLabelText("What changed").click();
    await userEvent.keyboard("Lost?");

    await expect.element(page.getByRole("textbox", { name: "Page source" })).not.toHaveTextContent("Lost?");
    await expect.element(page.getByLabelText("What changed")).toHaveValue("");
    await page.getByRole("button", { name: "Discard edit" }).click();
    await page.getByLabelText("What changed").fill("Kept.");
    await expect.element(page.getByLabelText("What changed")).toHaveValue("Kept.");
  });

  it("still forgets its restored draft on Discard after an autosave storage refused", async () => {
    serve(() => Response.json({}));
    vi.stubGlobal("confirm", () => true);
    await writeThenCrash();
    await page.getByRole("button", { name: "Restore edit" }).click();
    const full = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full.", "QuotaExceededError");
    });
    await page.getByLabelText("What changed").fill("Greet every reader.");
    await new Promise((resolve) => setTimeout(resolve, 600));
    full.mockRestore();
    await page.getByRole("button", { name: "Close editor" }).click();

    expect(readDraft("/docs/wiki/_svartz/submissions", { kind: "edit", page: "/wiki/guide/" })).toBeUndefined();
  });

  it("forgets the draft the reader discards", async () => {
    serve(() => Response.json({}));
    await writeThenCrash();
    await page.getByRole("button", { name: "Discard edit" }).click();

    await expect.element(page.getByRole("textbox", { name: "Page source" })).not.toHaveTextContent("Welcome.");
    await expect.element(page.getByLabelText("What changed")).toHaveValue("");
    await page.getByRole("button", { name: "Close editor" }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toBeVisible();
    expect(document.querySelector(".svartz-submissions-restore")).toBeNull();
  });

  it("keeps a new page's title and section", async () => {
    serve(() => Response.json({}));
    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "New page" }).click();
    await userEvent.keyboard("Ada Lovelace");
    await page.getByRole("combobox", { name: "Section" }).selectOptions("People");
    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard("She wrote the first program.");
    // Navigation closes the panel without asking.
    if (unmount) unmount();

    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "New page" }).click();
    await page.getByRole("button", { name: "Restore page" }).click();
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("Ada Lovelace");
    await expect.element(page.getByRole("combobox", { name: "Section" })).toHaveValue("People");
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("She wrote the first program.");
  });

  it("keeps a draft another tab saved while this one had nothing written", async () => {
    serve(() => Response.json({}));
    const endpoint = "/docs/wiki/_svartz/submissions";
    const target = { kind: "edit", page: "/wiki/guide/" } as const;
    const other = { kind: "edit", page: "/wiki/guide/", markdown: "From the other tab.", note: "", savedAt: Date.now() } as const;
    for (const leave of ["navigation", "close"] as const) {
      unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
      await page.getByRole("button", { name: "Edit" }).click();
      await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Guide");
      storeDraft(endpoint, target, other);
      if (leave === "close") await page.getByRole("button", { name: "Close editor" }).click();
      unmount?.();
      unmount = undefined;

      expect(readDraft(endpoint, target)).toEqual(other);
    }
  });

  it("keeps a discarded edit discarded when the page is left afterwards", async () => {
    serve(() => Response.json({}));
    vi.stubGlobal("confirm", () => true);
    await openEditor();
    await page.getByRole("button", { name: "Close editor" }).click();
    unmount?.();
    unmount = undefined;

    expect(readDraft("/docs/wiki/_svartz/submissions", { kind: "edit", page: "/wiki/guide/" })).toBeUndefined();
  });

  describe("saved before the page changed", () => {
    const NEWER = `${SOURCE}Newer change.\r\n`;

    /** Leave an edit of the guide unsent, then reopen the editor once the site serves a newer source. */
    async function reopenChanged() {
      let markdown = SOURCE;
      serve(() => Response.json({}), () => Response.json({ markdown }));
      await openEditor();
      // Navigation closes the panel and keeps the edit.
      if (unmount) unmount();
      markdown = NEWER;
      unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
      await page.getByRole("button", { name: "Edit" }).click();
    }

    it("warns that the page changed", async () => {
      await reopenChanged();

      await expect.element(page.getByRole("group", { name: /^Unsent edit from .+\. This page changed since you saved this draft\.$/ })).toBeVisible();
      await expect.element(page.getByRole("button", { name: "Restore anyway" })).toHaveFocus();
    });

    it("restores the draft anyway", async () => {
      await reopenChanged();
      await page.getByRole("button", { name: "Restore anyway" }).click();

      const source = page.getByRole("textbox", { name: "Page source" });
      await expect.element(source).toHaveTextContent("Welcome.");
      await expect.element(source).not.toHaveTextContent("Newer change.");
    });

    it("forgets the draft the reader discards", async () => {
      await reopenChanged();
      await page.getByRole("button", { name: "Discard edit" }).click();

      await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveTextContent("Newer change.");
      expect(readDraft("/docs/wiki/_svartz/submissions", { kind: "edit", page: "/wiki/guide/" })).toBeUndefined();
    });

    it("still warns after the restored draft saves again", async () => {
      await reopenChanged();
      await page.getByRole("button", { name: "Restore anyway" }).click();
      await userEvent.keyboard(" Again.");
      if (unmount) unmount();

      unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
      await page.getByRole("button", { name: "Edit" }).click();
      await expect.element(page.getByRole("group", { name: /This page changed since you saved this draft\.$/ })).toBeVisible();
    });
  });

  it("offers a draft that recorded no source without a warning", async () => {
    serve(() => Response.json({}));
    // As drafts were saved before they recorded their source.
    storeDraft("/docs/wiki/_svartz/submissions", { kind: "edit", page: "/wiki/guide/" }, {
      kind: "edit", page: "/wiki/guide/", markdown: `${SOURCE}Welcome.`, note: "", savedAt: Date.now(),
    });
    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "Edit" }).click();

    await expect.element(page.getByRole("group", { name: /^Unsent edit from .+\.$/ })).not.toHaveTextContent("This page changed");
    await expect.element(page.getByRole("button", { name: "Restore edit" })).toHaveFocus();
  });

  it("forgets the draft once the pull request opens", async () => {
    serve(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await openEditor();
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    if (unmount) unmount();

    unmount = mount("/docs/wiki/guide/", OPTIONS, CONTEXT);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveFocus();
    expect(document.querySelector(".svartz-submissions-restore")).toBeNull();
  });
});

describe("wikilink autocomplete", () => {
  it("suggests the site's notes after [[ and inserts the one picked from the keyboard", async () => {
    const source = await openOn("# Guide\n", 2);
    // `[[` types one `[` in userEvent's syntax.
    await userEvent.keyboard("See [[[[");

    await expect.element(page.getByRole("listbox")).toBeVisible();
    // Each note's link, then its title when the link doesn't already say it.
    expect(page.getByRole("option").elements().map((option) => option.textContent)).toEqual([
      "Ada Lovelace",
      "Guide",
      "People/GraceGrace Hopper",
    ]);
    // CodeMirror ignores Enter for 75ms after the list opens, so a keystroke meant for the text isn't taken as a pick.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard(" today.");

    await page.getByRole("radio", { name: "Source" }).click();
    await expect.element(source).toHaveTextContent("See [[People/Grace]] today.");
  });

  // `[[` types one `[` in userEvent's syntax; the cursor goes back before `after`, where the reader types `Gr`.
  it.each([
    ["a label", "|label]]", "See [[People/Grace|label]]"],
    ["a label with a bracket", "|A [[label]]", "See [[People/Grace|A [label]]"],
    ["a heading", "#Heading]]", "See [[People/Grace#Heading]]"],
    ["the rest of the name", "ace]]", "See [[People/Grace]]"],
    ["text after an unclosed link", " and more.", "See [[People/Grace]] and more."],
    ["a later link on the line", " and [[[[Guide]]", "See [[People/Grace]] and [[Guide]]"],
  ])("completes a link before %s without breaking it", async (_, after, expected) => {
    const source = await openOn("# Guide\n", 2);
    await userEvent.keyboard(`See [[[[${after}{ArrowLeft>${after.replaceAll("[[", "[").length}/}Gr`);
    await expect.element(page.getByRole("option", { name: /People\/Grace/ })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await userEvent.keyboard("{Enter}");

    await page.getByRole("radio", { name: "Source" }).click();
    await expect.element(source).toHaveTextContent(expected);
    expect(shownLine(2).textContent).toBe(expected);
  });

  it("narrows the suggestions as the reader types, and Escape closes them", async () => {
    await openOn("# Guide\n", 2);
    await userEvent.keyboard("[[[[gra");

    await expect.element(page.getByRole("option")).toHaveTextContent("People/GraceGrace Hopper");
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(page.getByRole("dialog")).toBeVisible();
  });
});

describe("Split", () => {
  const components = resolveContentComponents({}, svartzContentComponents);
  const SPLIT_CONTEXT = { base: "/docs", mountContent: async (target: HTMLElement) => mountContent(target, components) };
  /** Vitest's own viewport, which is below the phone breakpoint. */
  const PHONE = { width: 414, height: 896 };

  beforeEach(() => page.viewport(1280, 800));
  afterEach(() => page.viewport(PHONE.width, PHONE.height));

  /** The guide with LF line endings: the build, and so the preview, finds a callout only on an LF line. */
  const GUIDE = "---\ntitle: Guide\n---\n\n# Guide\n";

  /** Open the editor on the guide in Split, with the source's cursor at its end. `edit` answers the submission. */
  async function openSplit(edit: () => Response = () => Response.json({})) {
    const fetch = serve(edit, () => Response.json({ markdown: GUIDE }));
    unmount = mount("/docs/wiki/guide/", OPTIONS, SPLIT_CONTEXT);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("radio", { name: "Split" }).click();
    const source = page.getByRole("textbox", { name: "Page source" });
    await expect.element(source).toHaveTextContent("Guide");
    const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
    await source.click();
    await userEvent.keyboard(`{${mod}>}{End}{/${mod}}`);
    return fetch;
  }

  it("shows the page as the site renders it beside the source, and follows the reader's edits", async () => {
    await openSplit();
    const preview = page.getByRole("region", { name: "Preview" });
    await expect.element(preview.getByRole("heading", { level: 1 })).toHaveTextContent("Guide");
    expect(preview.element().textContent).not.toContain("title: Guide");

    // `[[` types one `[`.
    await userEvent.keyboard("{Enter}> [[!tip] Try it{Enter}> See [[[[Ada Lovelace]] and [[[[Nobody]].");

    await expect.element(preview.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/docs/wiki/ada-lovelace/");
    // An unresolved link looks as it does on the site: text that names a missing page.
    await expect.element(preview.getByRole("link", { name: "Nobody" })).toHaveAttribute("aria-disabled", "true");
    const callout = preview.element().querySelector(".sv-callout");
    expect(callout?.getAttribute("data-callout")).toBe("tip");
    expect(callout?.querySelector(".sv-callout-title-text")?.textContent).toBe("Try it");
    // The site's link component marks internal links.
    expect(preview.getByRole("link", { name: "Ada Lovelace" }).element().classList).toContain("sv-link-internal");
  });

  it("leaves the source's bytes as they were", async () => {
    const fetch = await openSplit(() => Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await userEvent.keyboard("Welcome.");
    await page.getByRole("radio", { name: "Live Preview" }).click();
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    const sent = fetch.mock.calls.find(([url]) => String(url).endsWith("/edit/"));
    expect(JSON.parse(String(sent![1]!.body)).markdown).toBe(`${GUIDE}Welcome.`);
  });

  it("puts the source and the preview under Write and Preview tabs on a phone", async () => {
    await page.viewport(390, 844);
    await openSplit();
    const write = page.getByRole("tab", { name: "Write" });
    const previewTab = page.getByRole("tab", { name: "Preview" });
    await expect.element(write).toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByRole("tabpanel", { name: "Write" })).toBeVisible();
    expect(page.getByRole("tabpanel", { name: "Preview" }).query()).toBeNull();

    await write.click();
    await userEvent.keyboard("{ArrowRight}");

    await expect.element(previewTab).toHaveAttribute("aria-selected", "true");
    await expect.element(previewTab).toHaveFocus();
    await expect.element(page.getByRole("tabpanel", { name: "Preview" }).getByRole("heading", { level: 1 })).toHaveTextContent("Guide");
    expect(page.getByRole("textbox", { name: "Page source" }).query()).toBeNull();

    await userEvent.keyboard("{Home}");
    await expect.element(write).toHaveFocus();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toBeVisible();
  });

  it("isn't offered where the page can't render content", async () => {
    serve(() => Response.json({}));
    await openEditor();

    await expect.element(page.getByRole("radio", { name: "Live Preview" })).toBeVisible();
    expect(page.getByRole("radio", { name: "Split" }).query()).toBeNull();
  });
});

describe("Rich text", () => {
  /** Every construct the toolbar writes, and the ones it can't, which must survive as they are. */
  const NOTE = [
    "---",
    "title: Guide",
    'hatnote: "See [[Ada Lovelace]]."',
    "tags: [people, guides]",
    "aliases:",
    "  - Handbook",
    "  - Manual",
    "infobox:",
    "  role: Lamplighter",
    "---",
    "",
    "# Guide",
    "",
    "Some **bold**, *soft*, ~~gone~~ and `code` with [a link](https://example.com).[^1]",
    "",
    "See [[People/Grace#Early life|Grace]], [[Ada Lovelace]] and ![[diagram.png]].",
    "",
    "> [!warning] Mind the gap",
    "> Inside the callout.",
    "",
    "- [ ] Write the page",
    "- A bullet",
    "1. A step",
    "",
    "| Lantern | Hours |",
    "| --- | --- |",
    "| Harbour | **9** |",
    "",
    "```js",
    "# not a heading",
    "```",
    "",
    "<details><summary>More</summary>",
    "Hidden *HTML*.",
    "</details>",
    "",
    "$$",
    "e = mc^2",
    "$$",
    "",
    "%% a comment %%",
    "",
    "[^1]: A *footnote*.",
  ].join("\n");
  const CRLF = NOTE.replaceAll("\n", "\r\n");
  /** The showcase wiki's notes, as a wiki's readers would open them. */
  const WIKI = Object.entries(import.meta.glob<string>("../../../vaults/showcase-wiki/**/*.md", { query: "?raw", import: "default", eager: true }))
    .map(([path, markdown]) => [path.slice(path.indexOf("showcase-wiki/")), markdown] as const);
  const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
  const toolbar = () => page.getByRole("toolbar", { name: "Formatting" });

  /** Open Edit on `markdown` and switch to Rich text, with the cursor where clicking the `line`th shown line puts it. */
  async function openRich(markdown: string, line = 1) {
    const source = await openOn(markdown);
    await page.getByRole("radio", { name: "Rich text" }).click();
    await expect.element(toolbar()).toBeVisible();
    await cursorTo(line);
    return source;
  }

  /** Back to Source, append `!` at the very end, and send: the sent Markdown is then the document plus `!`. */
  async function sendFromSource() {
    await page.getByRole("radio", { name: "Source" }).click();
    await page.getByRole("textbox", { name: "Page source" }).click();
    await userEvent.keyboard(`{${mod}>}{End}{/${mod}}!`);
    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    return sentMarkdown().slice(0, -1);
  }

  /** The line that shows `text` in the editor. */
  const lineWith = (text: string) => [...document.querySelectorAll<HTMLElement>(".svartz-submissions .cm-line")].find((line) => line.textContent === text);

  afterEach(() => page.viewport(414, 896));

  it.each([["LF", NOTE], ["CRLF", CRLF], ["only frontmatter", "---\ntitle: Guide\n---"], ...WIKI])("leaves %s byte for byte as it was, from Live Preview through Rich text and back", async (_, markdown) => {
    await openOn(markdown, 1);
    await page.getByRole("radio", { name: "Rich text" }).click();
    await expect.element(toolbar()).toBeVisible();
    // Walk the cursor through the note: moving through hidden syntax writes nothing.
    for (const line of document.querySelectorAll<HTMLElement>(".svartz-submissions .cm-line")) await userEvent.click(line);
    await page.getByRole("radio", { name: "Live Preview" }).click();

    await expect.element(page.getByRole("button", { name: "Open pull request" })).toBeDisabled();
    expect(await sendFromSource()).toBe(markdown);
  });

  it("shows the note formatted with no syntax, and what it can't format as source", async () => {
    await openRich(NOTE, 2);
    // The cursor's line hides its syntax too.
    await userEvent.click(lineWith("Guide")!);

    expect(lineWith("Guide")!.classList).toContain("cm-lp-h1");
    const shown = [...document.querySelectorAll(".svartz-submissions .cm-line")].map((line) => line.textContent);
    expect(shown).toContain("Some bold, soft, gone and code with a link.[^1]");
    expect(shown).toContain("See Grace, Ada Lovelace and diagram.png.");
    expect(shown).toContain("•A bullet");
    expect(shown).toContain("1. A step");
    expect(lineWith("Warning Mind the gap")?.dataset.callout).toBe("warning");
    for (const raw of ["| Harbour | **9** |", "# not a heading", "Hidden *HTML*.", "e = mc^2", "%% a comment %%", "[^1]: A *footnote*."]) {
      expect(lineWith(raw)?.classList, raw).toContain("cm-lp-raw");
    }
    // Frontmatter shows in the properties panel instead.
    expect(document.querySelector(".svartz-submissions .cm-content")!.textContent).not.toContain("title:");
  });

  it("lists the frontmatter's properties, lists as comma-separated text", async () => {
    await openRich(NOTE);

    const names = page.getByRole("textbox", { name: "Property name" }).elements().map((field) => (field as HTMLInputElement).value);
    expect(names).toEqual(["title", "hatnote", "tags", "aliases", "infobox"]);
    await expect.element(page.getByRole("textbox", { name: "title", exact: true })).toHaveValue("Guide");
    await expect.element(page.getByRole("textbox", { name: "hatnote" })).toHaveValue("See [[Ada Lovelace]].");
    await expect.element(page.getByRole("textbox", { name: "tags" })).toHaveValue("people, guides");
    await expect.element(page.getByRole("textbox", { name: "aliases" })).toHaveValue("Handbook, Manual");
    await expect.element(page.getByRole("textbox", { name: "infobox" })).toHaveValue("  role: Lamplighter");
  });

  it("writes an edited value into its own line only, in the note's line endings", async () => {
    await openRich(CRLF);
    await page.getByRole("textbox", { name: "title", exact: true }).fill("Guide: the basics");
    await page.getByRole("textbox", { name: "aliases" }).fill("Handbook, Manual, Primer");
    await page.getByRole("textbox", { name: "hatnote" }).fill("See [[Grace]].");

    expect(await sendFromSource()).toBe(CRLF
      .replace("title: Guide", 'title: "Guide: the basics"')
      .replace("  - Manual", "  - Manual\r\n  - Primer")
      .replace("See [[Ada Lovelace]].", "See [[Grace]]."));
  });

  it("keeps a single nested entry on its own line when its value is edited", async () => {
    await openRich(NOTE);
    await page.getByRole("textbox", { name: "infobox" }).fill("  role: Lighthouse keeper");

    expect(await sendFromSource()).toBe(NOTE.replace("  role: Lamplighter", "  role: Lighthouse keeper"));
  });

  it("renames a property", async () => {
    await openRich(NOTE);
    await page.getByRole("textbox", { name: "Property name" }).first().fill("name");
    await userEvent.keyboard("{Enter}");

    expect(await sendFromSource()).toBe(NOTE.replace("title: Guide", "name: Guide"));
  });

  it("adds a property, starting the frontmatter of a note without one", async () => {
    await openRich("# Guide\n");
    await page.getByRole("button", { name: "Add property" }).click();
    await expect.element(page.getByRole("textbox", { name: "Property name" })).toHaveFocus();
    await userEvent.keyboard("status");
    await page.getByRole("textbox", { name: "status" }).fill("draft");

    expect(await sendFromSource()).toBe("---\nstatus: draft\n---\n# Guide\n");
  });

  it("removes a property with all its lines", async () => {
    await openRich(NOTE);
    await page.getByRole("button", { name: "Remove aliases" }).click();

    await expect.element(page.getByRole("textbox", { name: "aliases" })).not.toBeInTheDocument();
    expect(await sendFromSource()).toBe(NOTE.replace("aliases:\n  - Handbook\n  - Manual\n", ""));
  });

  it("bolds the word at the cursor, shows the button pressed there, and unbolds it", async () => {
    await openRich("# Guide\n\nA brave lamplighter.\n", 3);
    await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}{ArrowRight}");
    const bold = toolbar().getByRole("button", { name: "Bold" });
    await expect.element(bold).toHaveAttribute("aria-pressed", "false");
    await bold.click();
    await expect.element(bold).toHaveAttribute("aria-pressed", "true");
    expect(lineWith("A brave lamplighter.")?.querySelector(".cm-lp-strong")?.textContent).toBe("brave");

    await bold.click();
    await expect.element(bold).toHaveAttribute("aria-pressed", "false");
    await userEvent.keyboard(`{${mod}>}i{/${mod}}`);
    expect(await sendFromSource()).toBe("# Guide\n\nA *brave* lamplighter.\n");
  });

  it("makes headings and lists from the toolbar, and plain lines again", async () => {
    await openRich("Title\n\nOne\nTwo\n", 1);
    await toolbar().getByRole("button", { name: "Heading 2" }).click();
    await expect.element(toolbar().getByRole("button", { name: "Heading 2" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(lineWith("One")!);
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await toolbar().getByRole("button", { name: "Numbered list" }).click();
    await toolbar().getByRole("button", { name: "Bulleted list" }).click();
    await expect.element(toolbar().getByRole("button", { name: "Bulleted list" })).toHaveAttribute("aria-pressed", "true");

    expect(await sendFromSource()).toBe("## Title\n\n- One\n- Two\n");
  });

  it("links the selection to the address typed, and edits that link", async () => {
    await openRich("Read the guide.\n", 1);
    await userEvent.keyboard("{End}{ArrowLeft}{Shift>}{ArrowLeft>5}{/Shift}");
    await userEvent.keyboard(`{${mod}>}k{/${mod}}`);
    const address = page.getByRole("textbox", { name: "Link address" });
    await expect.element(address).toHaveFocus();
    await userEvent.keyboard("https://example.com/a guide{Enter}");
    // Enter applied the link; it didn't send the panel's form or close it.
    await expect.poll(() => address.query()).toBeNull();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(lineWith("Read the guide.")?.querySelector(".cm-lp-link")?.textContent).toBe("guide");

    await userEvent.keyboard("{ArrowLeft}");
    await toolbar().getByRole("button", { name: "Link", exact: true }).click();
    await expect.element(address).toHaveValue("https://example.com/a%20guide");
    await page.getByRole("button", { name: "Remove link" }).click();
    expect(await sendFromSource()).toBe("Read the guide.\n");
  });

  it("closes the link form on Escape, leaving the panel open", async () => {
    await openRich("Read the guide.\n", 1);
    await toolbar().getByRole("button", { name: "Link", exact: true }).click();
    await userEvent.keyboard("{Escape}");

    await expect.poll(() => page.getByRole("textbox", { name: "Link address" }).query()).toBeNull();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect.element(page.getByRole("textbox", { name: "Page source" })).toHaveFocus();
  });

  it("links a page from the site's notes, as wikilink autocomplete suggests them", async () => {
    await openRich("See \n", 1);
    await userEvent.keyboard("{End}");
    await toolbar().getByRole("button", { name: "Link to a page" }).click();
    await expect.element(page.getByRole("listbox")).toBeVisible();
    await userEvent.keyboard("Gr");
    await expect.element(page.getByRole("option", { name: /People\/Grace/ })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await userEvent.keyboard("{Enter}");

    expect(await sendFromSource()).toBe("See [[People/Grace]]\n");
  });

  it("puts lines in a callout and takes them back out", async () => {
    await openRich("Mind the gap.\n", 1);
    const callout = toolbar().getByRole("button", { name: "Callout" });
    await callout.click();
    await expect.element(callout).toHaveAttribute("aria-pressed", "true");
    expect(lineWith("Note")?.dataset.callout).toBe("note");
    await page.getByRole("radio", { name: "Source" }).click();
    expect(shownLine(1).textContent).toBe("> [!note]");
    expect(shownLine(2).textContent).toBe("> Mind the gap.");
    await page.getByRole("radio", { name: "Rich text" }).click();
    await expect.poll(() => lineWith("Mind the gap.")).toBeDefined();
    await userEvent.click(lineWith("Mind the gap.")!);
    await toolbar().getByRole("button", { name: "Callout" }).click();

    expect(await sendFromSource()).toBe("Mind the gap.\n");
  });

  /** `markdown` as the site renders it, parsed. */
  async function rendered(markdown: string) {
    const html = await renderPreview(markdown, { notes: [], attachments: [], linkResolution: "shallowest", path: "guide.md", base: "", mountPath: "" });
    return new DOMParser().parseFromString(html, "text/html").body;
  }

  it("continues a list on Enter, and ends it on an empty item with a paragraph after the list", async () => {
    await openRich("- Oil\n", 1);
    await userEvent.keyboard("{End}{Enter}Wicks{Enter}{Enter}Done.");

    const sent = await sendFromSource();
    expect(sent).toBe("- Oil\n- Wicks\n\nDone.\n");
    const body = await rendered(sent);
    expect([...body.querySelectorAll("ul > li")].map((item) => item.textContent)).toEqual(["Oil", "Wicks"]);
    expect(body.querySelector(":scope > p")?.textContent).toBe("Done.");
  });

  it("ends a callout on an empty line, with a paragraph after it, in the note's line endings", async () => {
    await openRich("> [!note] Tip\r\n> Inside\r\n", 1);
    await userEvent.click(lineWith("Inside")!);
    await userEvent.keyboard("{End}{Enter}{Enter}Done.");

    const sent = await sendFromSource();
    expect(sent).toBe("> [!note] Tip\r\n> Inside\r\n\r\nDone.\r\n");
    const body = await rendered(sent);
    expect(body.querySelector(":scope > p")?.textContent).toBe("Done.");
    expect(body.querySelector("blockquote, .sv-callout")?.textContent).not.toContain("Done.");
  });

  it("ends a list inside a quote, keeping the quote", async () => {
    await openRich("> - Oil\n", 1);
    await userEvent.keyboard("{End}{Enter}{Enter}Done.");

    const sent = await sendFromSource();
    expect(sent).toBe("> - Oil\n>\n> Done.\n");
    const body = await rendered(sent);
    expect(body.querySelector("blockquote > p")?.textContent).toBe("Done.");
  });

  it("turns a heading back into text with Backspace at its start, and deletes past hidden syntax", async () => {
    await openRich("## Guide\n\nSome **bold**\n", 1);
    await userEvent.keyboard("{Home}{Backspace}");
    await userEvent.click(lineWith("Some bold")!);
    await userEvent.keyboard("{End}{Backspace}");

    expect(await sendFromSource()).toBe("Guide\n\nSome **bol**\n");
  });

  it.each([["Backspace"], ["Delete"]])("deletes the formatting with all of its text selected, on %s", async (key) => {
    await openRich("Some bold\n\nA *soft* word\n", 1);
    await userEvent.keyboard("{End}");
    await toolbar().getByRole("button", { name: "Bold" }).click();
    // Bold leaves its word selected.
    await userEvent.keyboard(`{${key}}`);
    await userEvent.dblClick(lineWith("A soft word")!.querySelector(".cm-lp-em")!);
    await userEvent.keyboard(`{${key}}`);

    expect(await sendFromSource()).toBe("Some \n\nA  word\n");
  });

  it("keeps typing out of the frontmatter", async () => {
    await openRich("---\ntitle: Guide\n---\nBody\n", 1);
    await userEvent.keyboard(`{${mod}>}{Home}{/${mod}}Top {Backspace}{Backspace}{Backspace}{Backspace}{Backspace}`);

    expect(await sendFromSource()).toBe("---\ntitle: Guide\n---\nBody\n");
  });

  it.each([
    ["LF", "---\ntitle: Guide\n---", "---\ntitle: Guide\n---\nBody"],
    ["CRLF", "---\r\ntitle: Guide\r\n---", "---\r\ntitle: Guide\r\n---\r\nBody"],
    ["LF with a final line break", "---\ntitle: Guide\n---\n", "---\ntitle: Guide\n---\nBody"],
  ])("starts the body of a note that is only frontmatter (%s) on a line of its own", async (_, markdown, written) => {
    await openRich(markdown, 1);
    await userEvent.keyboard("Body");

    expect(await sendFromSource()).toBe(written);
  });

  it("formats the first line of a note that is only frontmatter from the toolbar", async () => {
    await openRich("---\r\ntitle: Guide\r\n---", 1);
    await toolbar().getByRole("button", { name: "Heading 1" }).click();
    await userEvent.keyboard("Guide");

    expect(await sendFromSource()).toBe("---\r\ntitle: Guide\r\n---\r\n# Guide");
  });

  it("starts a several-line block as the first body of a CRLF note in the note's line endings", async () => {
    await openRich("---\r\ntitle: Guide\r\n---", 1);
    await toolbar().getByRole("button", { name: "Callout" }).click();

    // Each of the callout's lines is a line of the editor, not one line holding a bare LF.
    expect(await sendFromSource()).toMatch(/^---\r\ntitle: Guide\r\n---\r\n> \[!note\][^\n]*\r\n> /);
  });

  it("moves through the toolbar with arrow keys, Home and End, as one stop in the tab order", async () => {
    await openRich("Text\n", 1);
    const buttons = toolbar().getByRole("button");
    // From the close button, Tab reaches the toolbar.
    page.getByRole("button", { name: "Close editor" }).element().focus();
    await userEvent.tab();
    await expect.element(buttons.first()).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(toolbar().getByRole("button", { name: "Callout" })).toHaveFocus();
    await userEvent.keyboard("{Home}{ArrowRight}");
    await expect.element(toolbar().getByRole("button", { name: "Heading 2" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(toolbar().getByRole("button", { name: "Callout" })).toHaveFocus();

    // Tab leaves the toolbar, and Shift+Tab comes back to the button last focused.
    await userEvent.tab();
    expect(toolbar().element().contains(document.activeElement)).toBe(false);
    await userEvent.tab({ shift: true });
    await expect.element(toolbar().getByRole("button", { name: "Callout" })).toHaveFocus();
  });

  it("names every button, with the shortcut where there is one", async () => {
    await openRich("Text\n", 1);
    const names = toolbar().getByRole("button").elements().map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Heading 1", "Heading 2", "Heading 3", "Bold", "Italic", "Bulleted list", "Numbered list", "Link", "Link to a page", "Callout"]);
    await expect.element(toolbar().getByRole("button", { name: "Bold" })).toHaveAttribute("aria-keyshortcuts", `${mod === "Meta" ? "Meta" : "Control"}+B`);
  });

  it("fits the toolbar and properties on a 390 px phone", async () => {
    await page.viewport(390, 844);
    await openRich(NOTE, 12);
    const dialog = page.getByRole("dialog").element().getBoundingClientRect();
    for (const element of [...toolbar().getByRole("button").elements(), ...page.getByRole("textbox", { name: "Property name" }).elements()]) {
      const box = element.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(dialog.left);
      expect(box.right).toBeLessThanOrEqual(dialog.right);
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  });

  it("takes no formatting while the pull request opens", async () => {
    let answer!: (response: Response) => void;
    await openRich("Text\n", 1);
    await userEvent.keyboard("{End}!");
    serve(() => new Promise((resolve) => { answer = resolve; }), () => Response.json({ markdown: "Text\n" }));
    await page.getByRole("button", { name: "Open pull request" }).click();

    await expect.element(toolbar().getByRole("button", { name: "Bold" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Add property" })).toBeDisabled();
    answer(Response.json({ url: "https://github.com/acme/wiki/pull/7", number: 7 }, { status: 201 }));
    await expect.element(page.getByRole("link", { name: "View pull request #7" })).toBeVisible();
    expect(sentMarkdown()).toBe("Text!\n");
  });

  it("opens in Rich text when the reader last chose it", async () => {
    await openRich("Text\n", 1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await expect.element(toolbar()).toBeVisible();
    await expect.element(page.getByRole("radio", { name: "Rich text" })).toBeChecked();
  });
});

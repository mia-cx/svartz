import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../src/browser.css";
import { mount } from "../src/browser";
import { submissionPage, type SubmissionView } from "../src/submission-page";

const OPTIONS = { endpoint: "/wiki/_svartz/submissions", pages: ["/wiki/guide/"], folders: [""], tracked: true as const };
const HERE = "/wiki/-/dashboard/submissions/mine/42/";
const SOURCE = "---\ntitle: Guide\n---\n\n# Guide\n";
const SOURCE_SHA = "2b0f4c6e8a1d3f5b7c9e0a2c4e6f8b0d1f3a5c7e";
const VIEW: SubmissionView = {
  number: 42,
  title: "Guide",
  kind: "edit",
  stage: "open",
  url: "https://github.com/acme/wiki/pull/42",
  entries: [{ kind: "comment", comment: { id: 1, author: { login: "octocat" }, body: "Please cite a source.", at: "2026-11-19T11:00:00Z", url: "https://github.com/acme/wiki/pull/42#issuecomment-1" } }],
  back: "/wiki/-/dashboard/submissions/mine/",
  replyAction: "/wiki/_svartz/submissions/reply/",
  followUp: "guide.md",
};

let unmount: (() => void) | void;

/** The submission's page as the dashboard renders it, at `search`, with the browser script mounted. */
function show(view: SubmissionView = VIEW, search = "") {
  history.replaceState(null, "", `${HERE}${search}`);
  document.body.innerHTML = submissionPage(view).html;
  unmount = mount(HERE, OPTIONS);
}

afterEach(() => {
  if (unmount) unmount();
  unmount = undefined;
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("a submission in My submissions", () => {
  // Proves story 41 in the browser: Edit page opens the editor on the submission's branch, and saving adds the edit
  // to the submission, sending the SHA it loaded.
  it("opens the editor on the submission and adds the follow-up to it", async () => {
    const fetch = vi.fn(async (url: string) => url.includes("/follow-up/source/")
      ? Response.json({ markdown: SOURCE, sha: SOURCE_SHA, path: "guide.md" })
      : url.includes("/links/")
        ? Response.json({ notes: [], linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] })
        : Response.json({ kind: "commit", url: "https://github.com/acme/wiki/commit/c0ffee", sha: "c0ffee" }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    show();

    await page.getByRole("button", { name: "Edit page" }).click();
    const source = page.getByRole("textbox", { name: "Page source" });
    await expect.element(source).toHaveTextContent("Guide");
    await source.click();
    const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
    await userEvent.keyboard(`{${mod}>}{End}{/${mod}}Cited.`);
    await page.getByLabelText("What changed").fill("Cited a source.");
    const add = page.getByRole("button", { name: "Add to submission" });
    await expect.element(add).toHaveAccessibleDescription("Goes to review with your submission.");
    await add.click();

    await expect.element(page.getByRole("status").filter({ hasText: "Added" })).toHaveTextContent("Added to your submission.");
    const sent = fetch.mock.calls.find(([url]) => url === "/wiki/_svartz/submissions/follow-up/") as unknown as [string, RequestInit];
    expect(JSON.parse(String(sent[1].body))).toEqual({ pull: 42, markdown: `${SOURCE}Cited.`, note: "Cited a source.", sha: SOURCE_SHA });
    expect(fetch.mock.calls.map(([url]) => url)).toContain("/wiki/_svartz/submissions/follow-up/source/?pull=42");
  });

  it("offers no editor once the submission takes no follow-ups", async () => {
    show({ ...VIEW, stage: "closed", followUp: undefined });

    await expect.element(page.getByText("Closed without merging.")).toBeVisible();
    expect(document.querySelector('[data-svartz-region="follow-up-actions"]')).toBeNull();
  });

  // Proves a reply GitHub didn't take isn't lost: the form posts and the page comes back, and the text is put back.
  it("keeps an unsent reply when it comes back refused, and forgets it once sent", async () => {
    show();
    const form = document.querySelector<HTMLFormElement>('form[data-svartz-reply="conversation"]')!;
    form.addEventListener("submit", (event) => event.preventDefault());
    await page.getByLabelText("Reply", { exact: true }).fill("Added a source.");
    await page.getByRole("button", { name: "Send reply" }).click();
    unmount!();

    show({ ...VIEW, status: { code: "github" } }, "?status=github");
    await expect.element(page.getByRole("alert")).toHaveTextContent("GitHub didn't take your reply. Try again in a moment.");
    await expect.element(page.getByLabelText("Reply", { exact: true })).toHaveValue("Added a source.");
    unmount!();

    show({ ...VIEW, status: { code: "sent" } }, "?status=sent");
    await expect.element(page.getByRole("status")).toHaveTextContent("Reply sent.");
    await expect.element(page.getByLabelText("Reply", { exact: true })).toHaveValue("");
  });
});

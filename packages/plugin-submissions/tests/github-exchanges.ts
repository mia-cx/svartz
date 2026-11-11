/**
 * GitHub's side of a submission, as request/response pairs replayed in order. Response bodies follow GitHub's
 * REST API, trimmed to the fields the PR writer reads plus enough context to recognise them.
 */
import { expect, vi } from "vitest";

export const TOKEN = "github_pat_test";
export const REPO = "wikiplace/wikiplace.live";
export const BUILD_COMMIT = "7638417db6d59f3c431d3e1f261cc637155684cd";
/** The id the editor sent with the submission. */
export const SUBMISSION_ID = "4f1c2a9be03d5e7f8a6b1c0d9e2f3a4b";
const BASE_TREE = "691272480426f78a0138979dd3ce63b77f706feb";
const NEW_TREE = "cd8274d15fa3ae2ab983129fb037999f264ba9a7";
const NEW_COMMIT = "a6e2a36b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b";
export const API = `https://api.github.com/repos/${REPO}`;

export const GUIDE_SOURCE = "﻿---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n\r\nSet up the wiki.\r\n";

/** Pull request #42, as GitHub lists or creates it. */
export const PULL_42 = { number: 42, html_url: `https://github.com/${REPO}/pull/42`, state: "open" };

export interface Exchange {
  readonly request: { readonly method: string; readonly url: string; readonly body?: unknown };
  /** `hang`: GitHub never answers; the request ends only when its signal aborts. No `json` or `raw`: an empty body. */
  readonly response: { readonly status: number; readonly json?: unknown; readonly raw?: string; readonly hang?: true };
}

/** Reading `content/guide.md` at the build commit. */
export const sourceExchange: Exchange = {
  request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${BUILD_COMMIT}` },
  response: { status: 200, raw: GUIDE_SOURCE },
};

/** The branch for this submission of the page whose route slugs to `slug`: `guide`, or `wiki-guide` below a mount. */
export const branchFor = (slug: string) => `svartz/submission/edit/${slug}-${SUBMISSION_ID}`;

/** Looking up the open pull request from `branch`. */
export const pullLookup = (branch: string, pulls: unknown[] = []): Exchange => ({
  request: { method: "GET", url: `${API}/pulls?head=${encodeURIComponent(`wikiplace:${branch}`)}&state=open` },
  response: { status: 200, json: pulls },
});

export const labelExchange: Exchange = {
  request: { method: "POST", url: `${API}/issues/42/labels`, body: { labels: ["submission"] } },
  response: { status: 200, json: [{ name: "submission", color: "ededed" }] },
};

/** An edit of `content/guide.md` on `branch`, from the pull request lookup to the labels. */
export function editExchanges(
  { markdown, note, pageUrl, branch }: { markdown: string; note: string; pageUrl: string; branch: string },
): Exchange[] {
  return [
    pullLookup(branch),
    {
      request: { method: "GET", url: API },
      response: { status: 200, json: { full_name: REPO, default_branch: "main", private: false } },
    },
    {
      request: { method: "GET", url: `${API}/git/commits/${BUILD_COMMIT}` },
      response: { status: 200, json: { sha: BUILD_COMMIT, tree: { sha: BASE_TREE, url: `${API}/git/trees/${BASE_TREE}` }, parents: [] } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/git/trees`,
        body: { base_tree: BASE_TREE, tree: [{ path: "content/guide.md", mode: "100644", type: "blob", content: markdown }] },
      },
      response: { status: 201, json: { sha: NEW_TREE, truncated: false } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/git/commits`,
        body: { message: `Edit content/guide.md\n\n${note}`, tree: NEW_TREE, parents: [BUILD_COMMIT] },
      },
      response: { status: 201, json: { sha: NEW_COMMIT, tree: { sha: NEW_TREE } } },
    },
    {
      request: { method: "POST", url: `${API}/git/refs`, body: { ref: `refs/heads/${branch}`, sha: NEW_COMMIT } },
      response: { status: 201, json: { ref: `refs/heads/${branch}`, object: { sha: NEW_COMMIT, type: "commit" } } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/pulls`,
        body: {
          title: "Edit content/guide.md",
          head: branch,
          base: "main",
          body: `${note}\n\n---\nSubmitted anonymously from ${pageUrl}. Based on ${BUILD_COMMIT}.`,
        },
      },
      response: { status: 201, json: PULL_42 },
    },
    labelExchange,
  ];
}

/** Stub `fetch` with GitHub answering `exchanges` in order; each request must match the next one. */
export function replayGitHub(exchanges: readonly Exchange[]) {
  const pending = [...exchanges];
  const requests: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request = {
      method: init.method ?? "GET",
      url: String(input),
      ...(init.body === undefined ? {} : { body: JSON.parse(String(init.body)) as unknown }),
    };
    requests.push(request);
    const next = pending.shift();
    if (!next) throw new Error(`GitHub got an unexpected ${request.method} ${request.url}`);
    expect(request).toEqual(next.request);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    const { status, json, raw, hang } = next.response;
    if (hang) return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    if (raw !== undefined) return new Response(raw, { status });
    return json === undefined ? new Response(null, { status }) : Response.json(json, { status });
  });
  vi.stubGlobal("fetch", fetch);
  return { pending, requests };
}

/**
 * Fake timers that `AbortSignal.timeout` obeys too: it runs on Node's internal timers, so this one is rebuilt on
 * the faked clock. Undone by `vi.useRealTimers()` and `vi.restoreAllMocks()`.
 */
export function useFakeTimeouts() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
    return controller.signal;
  });
}

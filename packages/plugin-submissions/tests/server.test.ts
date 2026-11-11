import type { ServerContext } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MARKDOWN_BYTES } from "../src/api";
import createHandler from "../src/server";
import { GITHUB_TIMEOUT_MS } from "../src/github";
import {
  branchFor,
  BUILD_COMMIT,
  editExchanges,
  GUIDE_SOURCE,
  REPO,
  replayGitHub,
  sourceExchange,
  SUBMISSION_ID,
  TOKEN,
  useFakeTimeouts,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
// Deployed under /docs, vault mounted at /wiki.
const BASE = "/docs/wiki/_svartz/submissions";

const handler = createHandler(
  { repo: REPO, labels: ["submission"], token: { env: "SVARTZ_GITHUB_TOKEN" }, guard: { rateLimit: { limit: 100, period: 60 } } },
  { commit: BUILD_COMMIT, pages: { "/wiki/guide/": "content/guide.md" } },
);

function context(env: Record<string, unknown> = { SVARTZ_GITHUB_TOKEN: TOKEN }): ServerContext {
  return {
    env,
    clientAddress: "203.0.113.7",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    base: BASE,
    waitUntil: () => {},
  };
}

const source = (page: string) => new Request(`${ORIGIN}${BASE}/source/?page=${encodeURIComponent(page)}`);
/** An edit request; a non-string `body` is sent as JSON with this submission's id unless it names its own. */
const edit = (body: string | Record<string, unknown>) => new Request(`${ORIGIN}${BASE}/edit/`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify({ submissionId: SUBMISSION_ID, ...body }),
});

async function answer(request: Request, env?: Record<string, unknown>) {
  const response = await handler(request, context(env));
  if (!response) throw new Error("The handler declined the request");
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submissions server", () => {
  it("serves a published note's current source", async () => {
    replayGitHub([sourceExchange]);

    expect(await answer(source("/wiki/guide/"))).toEqual({ status: 200, body: { markdown: GUIDE_SOURCE } });
  });

  it("opens a pull request for an edit and answers its link", async () => {
    const markdown = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
    const note = "Added the time it takes.";
    const github = replayGitHub(editExchanges({ markdown, note, pageUrl: `${ORIGIN}/docs/wiki/guide/`, branch: branchFor("wiki-guide") }));

    expect(await answer(edit({ page: "/wiki/guide/", markdown, note }))).toEqual({
      status: 201,
      body: { url: `https://github.com/${REPO}/pull/42`, number: 42 },
    });
    expect(github.pending).toEqual([]);
  });

  it.each([
    ["a page outside the build", source("/wiki/drafts/secret/"), 404, "not_editable"],
    ["a path instead of a page", source("content/guide.md"), 404, "not_editable"],
    ["traversal out of the vault", edit({ page: "/wiki/../.github/workflows/ci.yml", markdown: "x" }), 404, "not_editable"],
    ["no page", source(""), 404, "not_editable"],
    ["a body that isn't JSON", edit("page=/wiki/guide/"), 400, "invalid_request"],
    ["an edit without a submission id", edit({ submissionId: undefined, page: "/wiki/guide/", markdown: "x" }), 400, "invalid_request"],
    ["a submission id that could name any branch", edit({ submissionId: "../../main", page: "/wiki/guide/", markdown: "x" }), 400, "invalid_request"],
    ["a note over the limit", edit({ page: "/wiki/guide/", markdown: "x", note: "x".repeat(2001) }), 400, "note_too_long"],
    ["an oversized page", edit({ page: "/wiki/guide/", markdown: "x".repeat(MAX_MARKDOWN_BYTES + 1) }), 413, "too_large"],
    ["a GET to the edit route", new Request(`${ORIGIN}${BASE}/edit/`), 405, "method_not_allowed"],
  ])("rejects %s before calling GitHub", async (_case, request, status, error) => {
    const github = replayGitHub([]);

    const response = await answer(request);

    expect(response).toEqual({ status, body: { error, message: expect.any(String) } });
    expect(github.requests).toEqual([]);
  });

  it("stops reading a streamed body without a length once it passes the limit", async () => {
    const github = replayGitHub([]);
    const CHUNK_BYTES = 64 * 1024;
    const CHUNKS = 64;
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++ === CHUNKS) return controller.close();
        controller.enqueue(new Uint8Array(CHUNK_BYTES));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(`${ORIGIN}${BASE}/edit/`, { method: "POST", body, duplex: "half" } as RequestInit);

    expect(await answer(request)).toEqual({ status: 413, body: { error: "too_large", message: expect.any(String) } });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(CHUNKS);
    expect(github.requests).toEqual([]);
  });

  it("tells the reader to try again when GitHub doesn't answer in time", async () => {
    useFakeTimeouts();
    replayGitHub([{ request: sourceExchange.request, response: { status: 0, hang: true } }]);

    const response = answer(source("/wiki/guide/"));
    await vi.advanceTimersByTimeAsync(GITHUB_TIMEOUT_MS);

    expect(await response).toEqual({
      status: 503,
      body: { error: "github_unavailable", message: "Couldn't reach GitHub right now. Try again in a moment." },
    });
  });

  it("names the missing token variable", async () => {
    expect(await answer(source("/wiki/guide/"), {})).toEqual({
      status: 503,
      body: {
        error: "misconfigured",
        message: "This site can't open pull requests yet: its server has no SVARTZ_GITHUB_TOKEN set.",
      },
    });
  });
});

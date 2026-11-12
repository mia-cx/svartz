import type { ServerContext } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MARKDOWN_BYTES } from "../src/api";
import createHandler from "../src/server";
import { GITHUB_TIMEOUT_MS } from "../src/github";
import type { GuardOptions } from "../src/guard";
import {
  APP_ID,
  APP_KEY,
  branchFor,
  BUILD_COMMIT,
  editExchanges,
  existenceCheck,
  GUIDE_SOURCE,
  INSTALLATION_TOKEN,
  installationLookup,
  newPageExchanges,
  pullLookup,
  REPO,
  replayGitHub,
  sourceExchange,
  SUBMISSION_ID,
  TOKEN,
  tokenExchange,
  useFakeTimeouts,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
// Deployed under /docs, vault mounted at /wiki.
const BASE = "/docs/wiki/_svartz/submissions";
const GUIDE_LINK = { link: "guide", title: "Guide", slug: "guide", path: "guide.md", href: "/wiki/guide/" };

/** A vault at `content/` with the guide at its top level and a published `People` folder holding an `.svx` page. */
const handlerWith = (guard: GuardOptions) => createHandler(
  { repo: REPO, labels: ["submission"], token: { env: "SVARTZ_GITHUB_TOKEN" }, guard },
  {
    commit: BUILD_COMMIT,
    pages: { "/wiki/guide/": "content/guide.md" },
    routes: { guide: "/wiki/guide/", "people/timeline": "/wiki/people/timeline/" },
    vaultRoot: "content",
    folders: ["", "People"],
    links: [GUIDE_LINK],
    preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: ["Assets/chart.png"] },
  },
);
const handler = handlerWith({ rateLimit: { limit: 100, period: 60 } });

/** `clientAddress: null` is a reader whose address the server can't see. */
function context(env: Record<string, unknown> = { SVARTZ_GITHUB_TOKEN: TOKEN }, clientAddress: string | null = "203.0.113.7"): ServerContext {
  return {
    env,
    clientAddress: clientAddress ?? undefined,
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

const ADA = "Ada Lovelace wrote the first published program.\n";
/** A new page request, sent as JSON with this submission's id and Ada's page unless it names its own. */
const newPage = (body: Record<string, unknown>) => new Request(`${ORIGIN}${BASE}/new/`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ submissionId: SUBMISSION_ID, markdown: ADA, ...body }),
});

async function answer(request: Request, env?: Record<string, unknown>, serve = handler, clientAddress?: string | null) {
  const response = await serve(request, context(env, clientAddress));
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

  it("lists the notes a wikilink can name without calling GitHub", async () => {
    const github = replayGitHub([]);

    expect(await answer(new Request(`${ORIGIN}${BASE}/links/`))).toEqual({ status: 200, body: {
      notes: [GUIDE_LINK],
      linkResolution: "shallowest",
      mountPath: "/wiki",
      tagsRoute: "tags",
      attachments: ["Assets/chart.png"],
    } });
    expect(github.requests).toEqual([]);
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

describe("as a GitHub App", () => {
  const appHandler = (guard: GuardOptions = { rateLimit: { limit: 100, period: 60 } }) => createHandler(
    { repo: REPO, labels: ["submission"], app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } }, guard },
    { commit: BUILD_COMMIT, pages: { "/wiki/guide/": "content/guide.md" }, routes: {}, vaultRoot: "content", folders: [""] },
  );
  const appEnv = { SVARTZ_GITHUB_APP_KEY: APP_KEY.pkcs1 };

  it("reads the source and opens the pull request with one installation token", async () => {
    const markdown = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
    const note = "Added the time it takes.";
    const serve = appHandler();
    const github = replayGitHub([
      installationLookup,
      tokenExchange(new Date(Date.now() + 60 * 60_000).toISOString()),
      sourceExchange,
      ...editExchanges({ markdown, note, pageUrl: `${ORIGIN}/docs/wiki/guide/`, branch: branchFor("wiki-guide") }),
    ], INSTALLATION_TOKEN);

    expect(await answer(source("/wiki/guide/"), appEnv, serve)).toEqual({ status: 200, body: { markdown: GUIDE_SOURCE } });
    expect(await answer(edit({ page: "/wiki/guide/", markdown, note }), appEnv, serve)).toEqual({
      status: 201,
      body: { url: `https://github.com/${REPO}/pull/42`, number: 42 },
    });
    expect(github.pending).toEqual([]);
  });

  it.each([
    ["Turnstile", { turnstile: { siteKey: "0x4AAAAAAAtest", secret: { env: "TURNSTILE_SECRET" } }, rateLimit: { limit: 5, period: 60 } }, 403, "turnstile_required"],
    ["required sign-in", { signInRequired: true, rateLimit: { limit: 5, period: 60 } }, 401, "sign_in_required"],
  ] as const)("passes the guard (%s) before exchanging the App's credentials", async (_case, guard, status, error) => {
    const github = replayGitHub([]);

    expect(await answer(edit({ page: "/wiki/guide/", markdown: "x" }), appEnv, appHandler(guard))).toMatchObject({
      status,
      body: { error },
    });
    expect(github.requests).toEqual([]);
  });

  it("names the missing private key variable", async () => {
    expect(await answer(source("/wiki/guide/"), {}, appHandler())).toEqual({
      status: 503,
      body: {
        error: "misconfigured",
        message: "This site can't open pull requests yet: its server has no SVARTZ_GITHUB_APP_KEY set.",
      },
    });
  });
});

describe("new pages", () => {
  it("adds the note named after its title in the chosen section, branched from the build commit", async () => {
    const github = replayGitHub(newPageExchanges({
      path: "content/People/Ada Lovelace.md",
      markdown: ADA,
      note: "She deserves a page.",
      pageUrl: `${ORIGIN}/docs/wiki/`,
      branch: branchFor("content-people-ada-lovelace", "new"),
    }));

    expect(await answer(newPage({ folder: "People", title: " Ada Lovelace ", note: "She deserves a page." }))).toEqual({
      status: 201,
      body: { url: `https://github.com/${REPO}/pull/42`, number: 42 },
    });
    expect(github.pending).toEqual([]);
  });

  it.each([
    ["a folder the build didn't publish", { folder: "Drafts", title: "Plans" }, 400, "not_a_section"],
    ["a folder outside the vault", { folder: "../.github/workflows", title: "ci" }, 400, "not_a_section"],
    ["a hidden folder", { folder: ".obsidian", title: "workspace" }, 400, "not_a_section"],
    ["a title that climbs out of its folder", { folder: "People", title: "../../.github/workflows/ci" }, 400, "invalid_title"],
    ["a title naming a hidden file", { folder: "", title: ".env" }, 400, "invalid_title"],
    ["a blank title", { folder: "People", title: "  " }, 400, "invalid_title"],
    ["a request without a section", { title: "Ada Lovelace" }, 400, "invalid_request"],
  ])("rejects %s before calling GitHub", async (_case, body, status, error) => {
    const github = replayGitHub([]);

    expect(await answer(newPage(body))).toEqual({ status, body: { error, message: expect.any(String) } });
    expect(github.requests).toEqual([]);
  });

  it("links the published page a title is already taken by, in any case, before calling GitHub", async () => {
    const github = replayGitHub([]);

    expect(await answer(newPage({ folder: "", title: "GUIDE" }))).toEqual({
      status: 409,
      body: {
        error: "exists",
        message: "A page with this title already exists. Choose another title, or edit that page.",
        existing: `${ORIGIN}/docs/wiki/guide/`,
      },
    });
    expect(github.requests).toEqual([]);
  });

  it("links a published page of any type that a title would take the route of, before calling GitHub", async () => {
    const github = replayGitHub([]);

    expect(await answer(newPage({ folder: "People", title: "Timeline" }))).toEqual({
      status: 409,
      body: expect.objectContaining({ error: "exists", existing: `${ORIGIN}/docs/wiki/people/timeline/` }),
    });
    expect(github.requests).toEqual([]);
  });

  it("refuses a title whose file the build commit has, unpublished, and writes nothing", async () => {
    const branch = branchFor("content-people-draft", "new");
    const github = replayGitHub([pullLookup(branch), existenceCheck("content/People/Draft.md", true)]);

    expect(await answer(newPage({ folder: "People", title: "Draft" }))).toEqual({
      status: 409,
      body: { error: "exists", message: "A page with this title already exists. Choose another title." },
    });
    expect(github.pending).toEqual([]);
  });

  it.each([
    ["without a Turnstile token", { turnstile: { siteKey: "0x4AAAAAAAtest", secret: { env: "TURNSTILE_SECRET" } }, rateLimit: { limit: 5, period: 60 } }, "203.0.113.7", 403, "turnstile_required"],
    ["from a reader the server can't see", { rateLimit: { limit: 5, period: 60 } }, null, 401, "sign_in_required"],
  ] as const)("passes the guard first: refuses a new page %s before calling GitHub", async (_case, guard, ip, status, error) => {
    const github = replayGitHub([]);

    const response = await answer(newPage({ folder: "People", title: "Ada Lovelace" }), undefined, handlerWith(guard), ip);

    expect(response).toEqual({ status, body: { error, message: expect.any(String) } });
    expect(github.requests).toEqual([]);
  });

  it("counts new pages against the rate limit before calling GitHub", async () => {
    const limited = handlerWith({ rateLimit: { limit: 1, period: 60 } });
    // Without a token the first new page stops at GitHub's step, having been counted.
    expect((await answer(newPage({ folder: "People", title: "Ada Lovelace" }), {}, limited)).status).toBe(503);
    const github = replayGitHub([]);

    expect(await answer(newPage({ folder: "People", title: "Ada Lovelace" }), undefined, limited)).toMatchObject({
      status: 429,
      body: { error: "rate_limited" },
    });
    expect(github.requests).toEqual([]);
  });
});

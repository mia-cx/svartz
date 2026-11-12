import type { ServerContext } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
// The auth package's own sealing, so the session cookie is exactly what a signed-in browser sends.
import { seal } from "../../auth/src/seal";
import { RATE_LIMIT_BINDING, SITEVERIFY_TIMEOUT_MS, type GuardOptions } from "../src/guard";
import createHandler from "../src/server";
import {
  branchFor,
  BUILD_COMMIT,
  editExchanges,
  GUIDE_SOURCE,
  REPO,
  replayGitHub,
  SUBMISSION_ID,
  TOKEN,
  useFakeTimeouts,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
const BASE = "/wiki/_svartz/submissions";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE = { siteKey: "0x4AAAAAAAtest", secret: { env: "TURNSTILE_SECRET" } };
const SESSION_SECRET = "test-secret-0123456789-abcdefghijklmnop";
const MARKDOWN = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
// Without SVARTZ_GITHUB_TOKEN a submission that passes the guard answers 503 `misconfigured` instead of reaching GitHub.
const GUARD_ONLY_ENV = { TURNSTILE_SECRET: "turnstile-secret", PRIVATE_SVARTZ_SESSION_SECRET: SESSION_SECRET };

function handlerWith(guard: GuardOptions) {
  return createHandler(
    { repo: REPO, labels: ["submission"], token: { env: "SVARTZ_GITHUB_TOKEN" }, guard },
    { commit: BUILD_COMMIT, pages: { "/wiki/guide/": "content/guide.md" }, routes: { guide: "/wiki/guide/" }, vaultRoot: "content", folders: [""] },
  );
}

async function sessionCookie(id: string): Promise<string> {
  const identity = { id, provider: "github", name: id, handle: id, avatarUrl: "", profileUrl: "" };
  return `__Host-svartz-session=${await seal(identity, SESSION_SECRET, "session", 60)}`;
}

/**
 * POST an edit (or, with `kind: "new"`, a new page) to `handler` as a reader at `ip` (`null`: an address the server
 * can't see), optionally signed in.
 */
async function submit(
  handler: ReturnType<typeof handlerWith>,
  { token, ip = "203.0.113.7", cookie, env = GUARD_ONLY_ENV, kind = "edit" }: {
    token?: string;
    ip?: string | null;
    cookie?: string;
    env?: Record<string, unknown>;
    kind?: "edit" | "new";
  } = {},
) {
  const fields = kind === "edit" ? { page: "/wiki/guide/" } : { folder: "", title: "Timeline" };
  const request = new Request(`${ORIGIN}${BASE}/${kind}/`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ submissionId: SUBMISSION_ID, ...fields, markdown: MARKDOWN, note: "Timing.", turnstileToken: token }),
  });
  const context: ServerContext = {
    env,
    clientAddress: ip ?? undefined,
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    base: BASE,
    waitUntil: () => {},
  };
  const response = await handler(request, context);
  if (!response) throw new Error("The handler declined the request");
  return { status: response.status, retryAfter: response.headers.get("retry-after"), body: await response.json() as Record<string, unknown> };
}

/**
 * Cloudflare's siteverify at the network edge, in front of whatever `fetch` was stubbed before (GitHub's replay).
 * Records each verification's form fields.
 */
function stubSiteverify(answer: (signal: AbortSignal | null | undefined) => Promise<Response>) {
  const next = globalThis.fetch;
  const verifications: Array<Record<string, string>> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input) !== SITEVERIFY) return next(input, init);
    verifications.push(Object.fromEntries(new URLSearchParams(String(init.body))));
    return answer(init.signal);
  });
  return verifications;
}

const verdict = (success: boolean) => async () => Response.json({ success, "error-codes": success ? [] : ["invalid-input-response"] });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submission guard", () => {
  it("opens the pull request once Cloudflare accepts the Turnstile token", async () => {
    const github = replayGitHub(editExchanges({ markdown: MARKDOWN, note: "Timing.", pageUrl: `${ORIGIN}/wiki/guide/`, branch: branchFor("wiki-guide") }));
    const verifications = stubSiteverify(verdict(true));

    const answer = await submit(handlerWith({ turnstile: TURNSTILE, rateLimit: { limit: 5, period: 60 } }), {
      token: "token-from-widget",
      env: { ...GUARD_ONLY_ENV, SVARTZ_GITHUB_TOKEN: TOKEN },
    });

    expect(answer).toMatchObject({ status: 201, body: { number: 42 } });
    expect(verifications).toEqual([{ secret: "turnstile-secret", response: "token-from-widget", remoteip: "203.0.113.7" }]);
    expect(github.pending).toEqual([]);
  });

  it("rejects an edit without a Turnstile token before calling anyone", async () => {
    const github = replayGitHub([]);
    const verifications = stubSiteverify(verdict(true));

    const answer = await submit(handlerWith({ turnstile: TURNSTILE, rateLimit: { limit: 5, period: 60 } }));

    expect(answer).toMatchObject({ status: 403, body: { error: "turnstile_required" } });
    expect(verifications).toEqual([]);
    expect(github.requests).toEqual([]);
  });

  it("rejects an edit whose Turnstile token Cloudflare refuses, before calling GitHub", async () => {
    const github = replayGitHub([]);
    stubSiteverify(verdict(false));

    const answer = await submit(handlerWith({ turnstile: TURNSTILE, rateLimit: { limit: 5, period: 60 } }), { token: "forged" });

    expect(answer).toMatchObject({ status: 403, body: { error: "turnstile_failed" } });
    expect(github.requests).toEqual([]);
  });

  it("gives up on Turnstile when Cloudflare doesn't answer in time", async () => {
    useFakeTimeouts();
    const github = replayGitHub([]);
    // Cloudflare hangs: the request ends only when its signal aborts.
    stubSiteverify((signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason))));

    const answer = submit(handlerWith({ turnstile: TURNSTILE, rateLimit: { limit: 5, period: 60 } }), { token: "token-from-widget" });
    await vi.advanceTimersByTimeAsync(SITEVERIFY_TIMEOUT_MS);

    expect(await answer).toMatchObject({ status: 503, body: { error: "turnstile_unavailable" } });
    expect(github.requests).toEqual([]);
  });

  it("limits anonymous readers per IP and says when to try again", async () => {
    const handler = handlerWith({ rateLimit: { limit: 2, period: 600 } });

    expect((await submit(handler)).status).toBe(503);
    expect((await submit(handler)).status).toBe(503);
    expect(await submit(handler)).toEqual({
      status: 429,
      retryAfter: "600",
      body: { error: "rate_limited", message: "You've sent too many edits. Try again in 10 minutes.", retryAfter: 600 },
    });
    expect((await submit(handler, { ip: "198.51.100.4" })).status).toBe(503);
  });

  it("limits signed-in readers per identity, wherever they send from", async () => {
    const handler = handlerWith({ rateLimit: { limit: 1, period: 60 } });
    const ada = await sessionCookie("github:1");

    expect((await submit(handler, { cookie: ada, ip: "203.0.113.7" })).status).toBe(503);
    expect(await submit(handler, { cookie: ada, ip: "198.51.100.4" })).toMatchObject({
      status: 429,
      body: { message: "You've sent too many edits. Try again in 1 minute." },
    });
    expect((await submit(handler, { cookie: await sessionCookie("github:2"), ip: "203.0.113.7" })).status).toBe(503);
  });

  it("uses the Workers rate-limiting binding when the server has one", async () => {
    const limit = vi.fn(async () => ({ success: false }));

    const answer = await submit(handlerWith({ rateLimit: { limit: 5, period: 60 } }), {
      env: { ...GUARD_ONLY_ENV, [RATE_LIMIT_BINDING]: { limit } },
    });

    expect(answer).toMatchObject({ status: 429, retryAfter: "60", body: { error: "rate_limited" } });
    expect(limit).toHaveBeenCalledWith({ key: "ip:203.0.113.7" });
  });

  it("asks the reader to try again when the rate-limiting binding fails", async () => {
    const limit = vi.fn(async () => { throw new Error("rate limiter unreachable"); });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const answer = await submit(handlerWith({ rateLimit: { limit: 5, period: 60 } }), {
      env: { ...GUARD_ONLY_ENV, [RATE_LIMIT_BINDING]: { limit } },
    });

    expect(answer).toMatchObject({ status: 503, body: { error: "rate_limit_unavailable", message: expect.any(String) } });
  });

  it("refuses anonymous edits when the server can't see the reader's address, but not signed-in ones", async () => {
    const handler = handlerWith({ rateLimit: { limit: 1, period: 60 } });

    expect(await submit(handler, { ip: null })).toMatchObject({
      status: 401,
      body: { error: "sign_in_required", message: "Sign in to send edits from this site, then open the pull request." },
    });
    // Another reader behind the same proxy isn't held to the first one's quota: they're refused for the same reason.
    expect((await submit(handler, { ip: null })).body).toMatchObject({ error: "sign_in_required" });
    expect((await submit(handler, { ip: null, cookie: await sessionCookie("github:1") })).status).toBe(503);
  });
});

describe("required sign-in", () => {
  const required = { signInRequired: true, rateLimit: { limit: 5, period: 60 } } as const;

  it.each(["edit", "new"] as const)("refuses an anonymous %s with 401 before calling GitHub", async (kind) => {
    const github = replayGitHub([]);

    const answer = await submit(handlerWith(required), { kind, env: { ...GUARD_ONLY_ENV, SVARTZ_GITHUB_TOKEN: TOKEN } });

    expect(answer).toMatchObject({ status: 401, body: { error: "sign_in_required" } });
    expect(github.requests).toEqual([]);
  });

  it("lets a signed-in reader through without a Turnstile token, counting them per identity", async () => {
    const verifications = stubSiteverify(verdict(true));
    const handler = handlerWith({ ...required, turnstile: TURNSTILE, rateLimit: { limit: 1, period: 60 } });
    const ada = await sessionCookie("github:1");

    expect(await submit(handler, { cookie: ada })).toMatchObject({ status: 503, body: { error: "misconfigured" } });
    expect(await submit(handler, { cookie: ada, ip: "198.51.100.4" })).toMatchObject({ status: 429 });
    expect(verifications).toEqual([]);
  });
});

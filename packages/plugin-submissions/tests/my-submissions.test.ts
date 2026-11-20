/**
 * My submissions: the dashboard panel, replies and follow-up edits, through Svartz's real server (the handle and the
 * dashboard page) beside the real `auth` plugin, on a real D1 from Miniflare. The mirror is filled through the
 * webhook route with GitHub's documented payloads, signed as GitHub signs them; what lands on GitHub is replayed.
 */
import { createHash, createHmac } from "node:crypto";
import type { Identity } from "@svartz/auth";
import { createServer, type PluginPage } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { header, postedText } from "../src/attribution";
import { permissions } from "../src/permissions";
import type { BuildData, ServerOptions } from "../src/server";
import {
  APP_BOT,
  APP_ID,
  APP_KEY,
  branchFor,
  BUILD_COMMIT,
  committerExchanges,
  GUIDE_SHA,
  GUIDE_SOURCE,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  OTHER_SHA,
  PULL_42,
  REPO,
  replayGitHub,
  SUBMISSION_ID,
  type Exchange,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
const BASE = "/wiki/_svartz/submissions";
const AUTH = "/wiki/_svartz/auth";
const MINE = "/wiki/-/dashboard/submissions/mine/";
const SECRET = "whsec-0123456789abcdef";
/** Delivering 500 signed comments takes a few seconds, more when the whole suite runs at once. */
const LONG_CONVERSATION_TIMEOUT_MS = 60_000;
const API = `https://api.github.com/repos/${REPO}`;
const BRANCH = branchFor("wiki-guide");
/** The submission branch's head: the commit the site's save made. */
const PULL_HEAD = "a6e2a36b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b";
const FOLLOW_UP_COMMIT = "b7f3a47c3ecc3f2d5f8e4f5b6c0a1d2e3f4a5b6c";
const BRANCH_TREE = "2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f";
const FOLLOW_UP_TREE = "3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a";

const ADA: Identity = { id: "github:583231", provider: "github", name: "Ada Lovelace", handle: "ada" };
const GRACE: Identity = { id: "github:2", provider: "github", name: "Grace Hopper", handle: "grace" };
const BOB: Identity = { id: "github:3", provider: "github", name: "Bob", handle: "bob" };
const MARKDOWN = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");

const BUILD: BuildData = {
  commit: BUILD_COMMIT,
  pages: { "/wiki/guide/": "content/guide.md" },
  routes: { guide: { slug: "guide", href: "/wiki/guide/" } },
  aliases: {},
  aliasesField: "aliases",
  vaultRoot: "content",
  folders: [""],
  links: [
    { link: "Guide", title: "Guide", slug: "guide", path: "guide.md", href: "/wiki/guide/" },
    { link: "grace", title: "Grace", slug: "users/grace", path: "users/grace.md", href: "/wiki/users/grace/" },
  ],
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] },
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * GitHub for whatever the test doesn't replay: the App's token, the reconcile poll's lists (empty), and opening a
 * pull request, which is #42.
 */
function quietGitHub() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    if (url.endsWith(`/app/installations/${INSTALLATION_ID}/access_tokens`)) {
      return Response.json({ token: INSTALLATION_TOKEN, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
    }
    const path = url.slice(API.length).split("?")[0];
    if (method === "POST" && path === "/pulls") return Response.json(PULL_42, { status: 201 });
    if (method === "POST") return Response.json({ sha: PULL_HEAD, ref: `refs/heads/${BRANCH}` }, { status: 201 });
    if (path === "") return Response.json({ full_name: REPO, default_branch: "main" });
    if (path?.startsWith("/git/commits/")) return Response.json({ sha: BUILD_COMMIT, tree: { sha: BRANCH_TREE } });
    if (path === "/actions/runs") return Response.json({ total_count: 0, workflow_runs: [] });
    return Response.json([]);
  }));
}

/**
 * A site on `build`, on a fresh D1, or on `miniflare`'s: `createSite(next, site.miniflare)` is the site after a deploy
 * of `next`, with its accounts, sessions and mirror.
 */
async function createSite(build: BuildData = BUILD, miniflare?: Miniflare) {
  if (!miniflare) {
    const fresh = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
    disposers.push(() => fresh.dispose());
    miniflare = fresh;
  }
  const db = await miniflare.getD1Database("SVARTZ_DB") as unknown as { prepare(sql: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> } } };
  const options: ServerOptions = {
    repo: REPO,
    labels: [],
    app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
    guard: { rateLimit: { limit: 100, period: 60 } },
    mode: "permission",
    sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } },
  };
  const server = createServer({
    basePath: "/wiki",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        id: "auth",
        eager: true,
        pages: ["account", "dashboard"],
        load: () => import("@svartz/auth/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins: [ADA.id],
          permissions: permissions(false, true),
          userPageVault: "wiki",
        },
        // User pages live in this vault; the build's notes (below) hold Grace's.
        data: { permissions: [] },
      },
      { id: "submissions", load: () => import("../src/server"), options, data: build },
    ],
  }, {
    privateEnv: {
      PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
      PRIVATE_GITHUB_SECRET: "fake-client-secret",
      SVARTZ_GITHUB_APP_KEY: APP_KEY.pkcs1,
      SVARTZ_GITHUB_WEBHOOK_SECRET: SECRET,
      SVARTZ_DB: db,
    },
    building: false,
    dev: false,
  });
  /** Work the server kept alive after answering, as a Worker's `waitUntil` does. */
  const background: Promise<unknown>[] = [];
  const event = (path: string, init: RequestInit) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7", platform: { ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } } };
  };
  const request = (path: string, { cookie, method = "GET", body, headers = {}, origin = ORIGIN }: { cookie?: string; method?: string; body?: BodyInit; headers?: Record<string, string>; origin?: string } = {}) => {
    const sent = new Headers(headers);
    if (cookie) sent.set("cookie", cookie);
    if (method === "POST" && !sent.has("x-github-event")) sent.set("origin", origin);
    return server.handle({ event: event(path, { method, headers: sent, body }), resolve: async () => new Response("page") });
  };
  const page = async (path: string, cookie?: string): Promise<PluginPage | undefined> => {
    const result = await server.page(event(path, { headers: cookie ? { cookie } : {} }));
    if (result && "redirect" in result) throw new Error("unexpected redirect");
    return result;
  };
  /** Wait for the work kept alive after every answer so far. */
  const settle = async () => {
    while (background.length > 0) await Promise.all(background.splice(0));
  };
  disposers.unshift(settle);
  const rows = async (sql: string, ...values: unknown[]) => (await db.prepare(sql).bind(...values).all()).results;
  return { request, page, settle, rows, miniflare };
}
type Site = Awaited<ReturnType<typeof createSite>>;

/** Sign `person` in with GitHub for the first time, through auth's real routes, and answer their session cookie. */
async function signIn({ request }: Site, person: Identity): Promise<string> {
  const user = { id: Number(person.id.split(":")[1]), login: person.handle, name: person.name };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json(user);
    return new Response(null, { status: 404 });
  });
  const cookies = (response: Response) => response.headers.getSetCookie().map((line) => line.split(";")[0]!).filter((pair) => !pair.endsWith("="));
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookie: cookies(start).join("; ") });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookie: cookies(callback).join("; "), body: new URLSearchParams({ handle: person.handle! }) });
  vi.unstubAllGlobals();
  return cookies(chosen).find((pair) => pair.startsWith("__Host-svartz-session="))!;
}

/** Post `payload` as GitHub delivers event `event`, signed with the webhook secret. */
async function deliver(site: Site, event: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const response = await site.request(`${BASE}/github/webhook/`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": crypto.randomUUID(),
      "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
    },
  });
  expect(response.status).toBe(204);
}

// Payloads as GitHub's webhook documentation describes them, trimmed to what a reader would recognise.
const repository = { id: 712_345, name: "wikiplace.live", full_name: REPO, owner: { login: "wikiplace", id: 9 }, private: false, default_branch: "main" };
const sender = { login: "octocat", id: 1, type: "User" };
const octocat = { login: "octocat", id: 1, type: "User" };
const pullRequest = ({ number = 42, state = "open", merged = null as string | null, updated = "2026-11-19T11:00:00Z" } = {}) => ({
  url: `${API}/pulls/${number}`,
  number,
  state,
  title: "Edit content/guide.md",
  user: { login: `${APP_BOT.name}`, id: 41_898_282, type: "Bot" },
  html_url: `https://github.com/${REPO}/pull/${number}`,
  created_at: "2026-11-19T10:00:00Z",
  updated_at: updated,
  closed_at: state === "closed" ? updated : null,
  merged_at: merged,
  merge_commit_sha: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
  head: { label: `wikiplace:${BRANCH}`, ref: BRANCH, sha: PULL_HEAD },
  base: { label: "wikiplace:main", ref: "main", sha: BUILD_COMMIT },
});
const reviewComment = (id: number, body: string, at: string, inReplyTo?: number) => ({
  id,
  pull_request_review_id: 4_000_002,
  path: "content/guide.md",
  line: 7,
  original_line: 7,
  body,
  user: octocat,
  html_url: `${PULL_42.html_url}#discussion_r${id}`,
  pull_request_url: `${API}/pulls/42`,
  created_at: at,
  updated_at: at,
  ...(inReplyTo ? { in_reply_to_id: inReplyTo } : {}),
});
const issueComment = (id: number, body: string, at: string, user = octocat) => ({
  id,
  body,
  user,
  html_url: `${PULL_42.html_url}#issuecomment-${id}`,
  issue_url: `${API}/issues/42`,
  created_at: at,
  updated_at: at,
});

/** Grace, a signed-in reader, saves an edit of the guide, which opens pull request #42 from {@link BRANCH}. */
async function graceSubmits(site: Site): Promise<string> {
  const grace = await signIn(site, GRACE);
  quietGitHub();
  const saved = await site.request(`${BASE}/edit/`, {
    method: "POST",
    cookie: grace,
    body: JSON.stringify({ submissionId: SUBMISSION_ID, page: "/wiki/guide/", markdown: MARKDOWN, note: "Added the time it takes." }),
  });
  expect(await saved.json()).toMatchObject({ kind: "pull-request", number: 42 });
  return grace;
}

/** GitHub's deliveries for #42: opened, a review asking for changes, a comment, and a diff thread with a reply. */
async function reviewed(site: Site) {
  await deliver(site, "pull_request", { action: "opened", number: 42, pull_request: pullRequest(), repository, sender });
  await deliver(site, "pull_request_review", {
    action: "submitted",
    review: {
      id: 4_000_001, user: octocat, body: "Please cite a source.", commit_id: PULL_HEAD, submitted_at: "2026-11-19T11:10:00Z",
      state: "changes_requested", html_url: `${PULL_42.html_url}#pullrequestreview-4000001`,
    },
    pull_request: pullRequest({ updated: "2026-11-19T11:10:00Z" }),
    repository,
    sender,
  });
  await deliver(site, "issue_comment", {
    action: "created",
    issue: { number: 42, title: "Edit content/guide.md", state: "open", pull_request: { url: `${API}/pulls/42`, html_url: PULL_42.html_url } },
    comment: issueComment(3_000_001, "Thanks! <script>alert(1)</script>\nSecond line.", "2026-11-19T11:20:00Z"),
    repository,
    sender,
  });
  for (const comment of [
    reviewComment(5_000_001, "Which wiki?", "2026-11-19T11:30:00Z"),
    reviewComment(5_000_002, "The one this site runs.", "2026-11-19T11:40:00Z", 5_000_001),
  ]) {
    await deliver(site, "pull_request_review_comment", { action: "created", comment, pull_request: pullRequest({ updated: "2026-11-19T11:40:00Z" }), repository, sender });
  }
}

/** What a reader sees of `page`: its text, with entities as their characters. */
const text = (page: PluginPage | undefined) => (page?.html ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();

const form = (fields: Record<string, string>) => new URLSearchParams(fields);

describe("My submissions", () => {
  // Proves stories 40 and 42: each account sees its own submissions with their review state, nobody sees anyone
  // else's, and a guest has no panel at all.
  it("lists a reader's own submissions, and only to them", async () => {
    // The site stamps a save with the time it happens: pin the clock so Grace's is always sent on the same day.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T12:00:00Z") });
    const site = await createSite();
    const grace = await graceSubmits(site);
    const ada = await signIn(site, ADA);
    quietGitHub();
    await reviewed(site);

    expect(text(await site.page(MINE, grace))).toBe("Dashboard My submissions Guide Edit · #42 · sent Nov 19, 2026 · 3 comments Changes requested");
    expect(text(await site.page(MINE, ada))).toBe("Dashboard My submissions Edits you send for review show up here.");
    expect(await site.page(`${MINE}42/`, ada)).toBeUndefined();
    expect(await site.page(MINE)).toBeUndefined();
    expect(await site.page("/wiki/-/dashboard/")).toBeUndefined();
  });

  // Proves the list keeps a submission at "Changes requested" while any reviewer's latest decision asks for changes,
  // as GitHub counts it: another reviewer's approval doesn't clear it, the same reviewer's later approval or a
  // dismissal does.
  it("keeps changes requested until that reviewer approves or the review is dismissed", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    quietGitHub();
    await reviewed(site);
    const hubot = { login: "hubot", id: 4, type: "User" };
    const decide = (action: string, id: number, user: typeof octocat, state: string, at: string) => deliver(site, "pull_request_review", {
      action,
      review: { id, user, body: "", commit_id: PULL_HEAD, submitted_at: at, state, html_url: `${PULL_42.html_url}#pullrequestreview-${id}` },
      pull_request: pullRequest({ updated: at }),
      repository,
      sender,
    });
    const state = async () => text(await site.page(MINE, grace)).replace(/.* comments /, "");

    await decide("submitted", 4_000_002, hubot, "approved", "2026-11-19T11:50:00Z");
    expect(await state()).toBe("Changes requested");

    await decide("submitted", 4_000_003, octocat, "commented", "2026-11-19T12:00:00Z");
    await decide("dismissed", 4_000_001, octocat, "dismissed", "2026-11-19T11:10:00Z");
    expect(await state()).toBe("Approved");

    await decide("submitted", 4_000_004, octocat, "changes_requested", "2026-11-19T12:10:00Z");
    expect(await state()).toBe("Changes requested");
    await decide("submitted", 4_000_005, octocat, "approved", "2026-11-19T12:20:00Z");
    expect(await state()).toBe("Approved");
  });

  // Proves story 40: the submission shows where it stands, its review and its comments, threads kept together, and
  // GitHub's text arrives as text, never as markup.
  it("shows a submission's status, reviews and threaded comments, escaped", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    await reviewed(site);

    const view = await site.page(`${MINE}42/`, grace);

    expect(text(view)).toBe([
      "Dashboard My submissions Guide Edit · Open the page · Pull request #42 on GitHub Waiting for review.",
      "Conversation",
      "octocat requested changes Nov 19, 2026 Please cite a source.",
      "octocat Nov 19, 2026 Thanks! <script>alert(1)</script> Second line.",
      "On content/guide.md , line 7 octocat Nov 19, 2026 Which wiki? octocat Nov 19, 2026 The one this site runs. Reply Your reply Send reply",
      "Reply Send reply",
    ].join(" "));
    expect(view!.html).not.toContain("<script>");
    // The editor's button goes here while the submission is open.
    expect(view!.html).toContain('data-svartz-follow-up="42" data-svartz-follow-up-path="guide.md"');
  });

  // Proves a long conversation shows its newest 500 comments, deleted ones not counted, with the first comment of
  // every thread they're in, and links to GitHub for the rest.
  it("shows the newest comments of a long conversation, with their threads", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    await reviewed(site);
    const issue = { number: 42, title: "Edit content/guide.md", state: "open", pull_request: { url: `${API}/pulls/42`, html_url: PULL_42.html_url } };
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 19, 12) + minute * 60_000).toISOString().replace(".000", "");
    for (let n = 1; n <= 499; n++) {
      await deliver(site, "issue_comment", { action: "created", issue, comment: issueComment(3_100_000 + n, `Comment ${n}.`, at(n)), repository, sender });
    }
    await deliver(site, "pull_request_review_comment", {
      action: "created", comment: reviewComment(5_000_004, "Still the one this site runs.", at(500), 5_000_001), pull_request: pullRequest(), repository, sender,
    });
    const regret = issueComment(3_200_000, "Never mind.", at(501));
    await deliver(site, "issue_comment", { action: "created", issue, comment: regret, repository, sender });
    await deliver(site, "issue_comment", { action: "deleted", issue, comment: regret, repository, sender });
    quietGitHub();

    const shown = text(await site.page(`${MINE}42/`, grace));

    expect(shown).toContain("Conversation Read earlier comments on GitHub octocat requested changes Nov 19, 2026 Please cite a source. "
      + "On content/guide.md , line 7 octocat Nov 19, 2026 Which wiki? octocat Nov 19, 2026 Still the one this site runs. Reply Your reply Send reply "
      + "octocat Nov 19, 2026 Comment 1. ");
    expect(shown).toContain("Comment 499. Reply Send reply");
    expect(shown).not.toContain("Second line.");
    expect(shown).not.toContain("The one this site runs.");
    expect(shown).not.toContain("Never mind.");
  }, LONG_CONVERSATION_TIMEOUT_MS);
});

describe("replies", () => {
  // Proves story 41 and the PRD's attribution: the App posts the reply under a header naming the account, its role
  // and its user page, mentions don't notify anyone, and the site shows the reply as the account that wrote it.
  it("posts a reply through the App with the attribution header, on the conversation and in a thread", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    await reviewed(site);
    await site.settle();
    const heading = `> [!NOTE]\n> Sent from wiki.example by [Grace Hopper (grace)](<${ORIGIN}/wiki/users/grace/>), submitter.`;
    const replay = replayGitHub([
      {
        request: { method: "POST", url: `${API}/issues/42/comments`, body: { body: `${heading}\n\nAdded one, @⁠octocat.` } },
        response: { status: 201, json: issueComment(3_000_002, `${heading}\n\nAdded one, @⁠octocat.`, "2026-11-19T12:00:00Z", { login: APP_BOT.name, id: 41_898_282, type: "Bot" }) },
      },
      {
        request: { method: "POST", url: `${API}/pulls/42/comments/5000001/replies`, body: { body: `${heading}\n\nThanks.` } },
        response: { status: 201, json: { ...reviewComment(5_000_003, `${heading}\n\nThanks.`, "2026-11-19T12:05:00Z", 5_000_001), user: { login: APP_BOT.name } } },
      },
    ], INSTALLATION_TOKEN);

    const answered = await site.request(`${BASE}/reply/`, { method: "POST", cookie: grace, body: form({ pull: "42", body: "Added one, @octocat.\r\n" }) });
    const threaded = await site.request(`${BASE}/reply/`, { method: "POST", cookie: grace, body: form({ pull: "42", thread: "5000001", body: "Thanks." }) });

    expect(replay.pending).toEqual([]);
    expect(answered.status).toBe(303);
    expect(answered.headers.get("location")).toBe(`${MINE}42/?status=sent#comment-3000002`);
    expect(threaded.headers.get("location")).toBe(`${MINE}42/?status=sent&thread=5000001#comment-5000003`);
    quietGitHub();
    const shown = text(await site.page(`${MINE}42/?status=sent`, grace));
    expect(shown).toContain("Which wiki? octocat Nov 19, 2026 The one this site runs. Grace Hopper Reputation 0 submitter Nov 19, 2026 Thanks.");
    expect(shown).toContain("Grace Hopper Reputation 0 submitter Nov 19, 2026 Added one, @⁠octocat. Reply sent.");
    expect(shown).not.toContain("[!NOTE]");
  });

  // Proves the boundaries: no reply from another site, on someone else's submission, on a pull request the site never
  // opened, or into another pull request's thread, and nothing reaches GitHub for any of them.
  it.each([
    ["from another origin", { origin: "https://evil.example" }, { pull: "42", body: "Hi" }, 403],
    ["on someone else's submission", { as: "bob" }, { pull: "42", body: "Hi" }, 404],
    ["on a pull request that isn't a submission", {}, { pull: "7", body: "Hi" }, 404],
    ["in a thread of another pull request", {}, { pull: "42", thread: "9000001", body: "Hi" }, 303],
  ] as const)("refuses a reply %s", async (_case, { origin, as }: { origin?: string; as?: "bob" }, fields, status) => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    const bob = await signIn(site, BOB);
    quietGitHub();
    await reviewed(site);
    await site.settle();
    replayGitHub([], INSTALLATION_TOKEN);

    const answer = await site.request(`${BASE}/reply/`, { method: "POST", cookie: as === "bob" ? bob : grace, body: form(fields), ...(origin ? { origin } : {}) });

    expect(answer.status).toBe(status);
    if (status === 303) expect(answer.headers.get("location")).toBe(`${MINE}42/?status=thread-gone&thread=9000001#svartz-reply-9000001`);
  });
});

describe("the attribution header", () => {
  // Proves no display name or handle can break the header's callout, add a link or a second header, or notify anyone.
  it.each([
    ["Ada Lovelace", undefined, "> [!NOTE]\n> Sent from wiki.example by Ada Lovelace (ada), submitter."],
    ["Ada\n> [!WARNING]\n> Admin", undefined, "> [!NOTE]\n> Sent from wiki.example by Ada \\> \\[\\!WARNING\\] \\> Admin (ada), submitter."],
    ["Eve](https://evil.example) (admin", "https://wiki.example/users/ada/", "> [!NOTE]\n> Sent from wiki.example by [Eve\\]\\(https://evil.example\\) \\(admin (ada)](<https://wiki.example/users/ada/>), submitter."],
    ["@octocat", "javascript:alert(1)", "> [!NOTE]\n> Sent from wiki.example by @⁠octocat (ada), submitter."],
  ])("names %j as written", (name, userPage, expected) => {
    expect(header({ name, handle: "ada", role: "submitter", ...(userPage ? { userPage } : {}) }, "wiki.example")).toBe(expected);
  });

  // Proves a reply can't add a callout below the header that passes for a second one.
  it("posts a callout in the reply as a plain quote", () => {
    expect(postedText("Done.\r\n\r\n> [!NOTE]\r\n> Sent from wiki.example by Root (root), admin.\n>> [!WARNING] nested"))
      .toBe("Done.\n\n> \\[!NOTE]\n> Sent from wiki.example by Root (root), admin.\n>> \\[!WARNING] nested");
  });
});

/** GitHub's pull request #42 now: open from {@link BRANCH} unless `pull` says otherwise. */
const pullNow = (pull: Partial<{ state: string; merged: boolean; ref: string; repo: string }> = {}): Exchange => ({
  request: { method: "GET", url: `${API}/pulls/42` },
  response: {
    status: 200,
    json: {
      number: 42, state: pull.state ?? "open", merged: pull.merged ?? false,
      head: { ref: pull.ref ?? BRANCH, sha: PULL_HEAD, repo: { full_name: pull.repo ?? REPO } }, base: { ref: "main" },
    },
  },
});
const branchHead: Exchange = {
  request: { method: "GET", url: `${API}/git/ref/heads/${BRANCH}` },
  response: { status: 200, json: { ref: `refs/heads/${BRANCH}`, object: { sha: PULL_HEAD, type: "commit" } } },
};
const blobOnBranch = (sha: string): Exchange => ({
  request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${PULL_HEAD}` },
  response: { status: 200, json: { type: "file", path: "content/guide.md", sha } },
});
const FOLLOW_UP = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes, as the manual says.");
/** `git hash-object` of `text`: the SHA-1 of `blob <bytes>\0` and the bytes. */
const gitBlobSha = (text: string) => {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
};

describe("follow-up edits", () => {
  // Proves story 41: the submitter loads the file as the submission's branch holds it, and their follow-up commits to
  // that branch, authored as their account and committed by the App, never anywhere else.
  it("commits the submitter's follow-up to the submission's branch, attributed", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    await site.settle();
    const graceId = (await site.rows("SELECT id FROM auth_accounts WHERE handle = 'grace'"))[0]!.id;
    const loads = replayGitHub([pullNow(), { request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${PULL_HEAD}` }, response: { status: 200, raw: MARKDOWN } }], INSTALLATION_TOKEN);

    const source = await site.request(`${BASE}/follow-up/source/?pull=42`, { cookie: grace });

    const loadedSha = gitBlobSha(MARKDOWN);
    expect(await source.json()).toEqual({ markdown: MARKDOWN, sha: loadedSha, path: "guide.md" });
    expect(loads.pending).toEqual([]);

    const message = `Edit content/guide.md\n\nCited the manual.\n\nCo-authored-by: Grace Hopper <2+grace@users.noreply.github.com>\nSvartz-Account: ${graceId}`;
    const author = { name: "Grace Hopper", email: "grace@users.noreply.wiki.example" };
    const commits = replayGitHub([
      pullNow(),
      ...committerExchanges,
      branchHead,
      blobOnBranch(loadedSha),
      { request: { method: "GET", url: `${API}/git/commits/${PULL_HEAD}` }, response: { status: 200, json: { sha: PULL_HEAD, tree: { sha: BRANCH_TREE } } } },
      {
        request: { method: "POST", url: `${API}/git/trees`, body: { base_tree: BRANCH_TREE, tree: [{ path: "content/guide.md", mode: "100644", type: "blob", content: FOLLOW_UP }] } },
        response: { status: 201, json: { sha: FOLLOW_UP_TREE } },
      },
      {
        request: { method: "POST", url: `${API}/git/commits`, body: { message, tree: FOLLOW_UP_TREE, parents: [PULL_HEAD], author, committer: APP_BOT } },
        response: { status: 201, json: { sha: FOLLOW_UP_COMMIT, html_url: `https://github.com/${REPO}/commit/${FOLLOW_UP_COMMIT}` } },
      },
      {
        request: { method: "PATCH", url: `${API}/git/refs/heads/${BRANCH}`, body: { sha: FOLLOW_UP_COMMIT, force: false } },
        response: { status: 200, json: { ref: `refs/heads/${BRANCH}`, object: { sha: FOLLOW_UP_COMMIT } } },
      },
    ], INSTALLATION_TOKEN);

    const saved = await site.request(`${BASE}/follow-up/`, {
      method: "POST",
      cookie: grace,
      body: JSON.stringify({ pull: 42, markdown: FOLLOW_UP, note: "Cited the manual.", sha: loadedSha }),
    });

    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual({ kind: "commit", url: `https://github.com/${REPO}/commit/${FOLLOW_UP_COMMIT}`, sha: FOLLOW_UP_COMMIT });
    expect(commits.pending).toEqual([]);
  });

  // Proves the follow-up gate: the submitter and a reviewer (an admin holds submissions:reviews:write) may load it,
  // anyone else is told there's no such submission, and GitHub hears nothing from them.
  it("lets only the submitter or a reviewer push follow-ups", async () => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    const ada = await signIn(site, ADA);
    const bob = await signIn(site, BOB);
    await site.settle();
    const source: Exchange = { request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${PULL_HEAD}` }, response: { status: 200, raw: MARKDOWN } };

    for (const cookie of [grace, ada]) {
      replayGitHub([pullNow(), source], INSTALLATION_TOKEN);
      expect((await site.request(`${BASE}/follow-up/source/?pull=42`, { cookie })).status).toBe(200);
    }
    replayGitHub([], INSTALLATION_TOKEN);
    expect((await site.request(`${BASE}/follow-up/source/?pull=42`, { cookie: bob })).status).toBe(404);
    expect((await site.request(`${BASE}/follow-up/`, { method: "POST", cookie: bob, body: JSON.stringify({ pull: 42, markdown: FOLLOW_UP, sha: GUIDE_SHA }) })).status).toBe(404);
    expect((await site.request(`${BASE}/follow-up/source/?pull=42`)).status).toBe(401);
  });

  // Proves permissions are checked on the page the file publishes as now: once the guide moves, a deny on its new
  // page refuses the submitter's follow-ups, though the submission was saved under the old address.
  it("checks follow-ups against the page the file publishes as now", async () => {
    const before = await createSite();
    const grace = await graceSubmits(before);
    await before.settle();
    const moved = { link: "Guide", title: "Guide", slug: "protected-guide", path: "guide.md", href: "/wiki/protected-guide/" };
    const site = await createSite({
      ...BUILD,
      pages: { [moved.href]: "content/guide.md" },
      routes: { [moved.slug]: { slug: moved.slug, href: moved.href } },
      links: [moved, ...BUILD.links.filter(({ path }) => path !== moved.path)],
    }, before.miniflare);
    const [{ id }] = await site.rows("SELECT id FROM auth_accounts WHERE handle = 'grace'") as [{ id: string }];
    await site.rows(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at)
      VALUES ('account', ?, 'page:wiki/protected-guide', 'submissions:pull-requests:write', 'deny', '2026-11-19T00:00:00.000Z')`, id);
    const replay = replayGitHub([], INSTALLATION_TOKEN);

    const source = await site.request(`${BASE}/follow-up/source/?pull=42`, { cookie: grace });
    const saved = await site.request(`${BASE}/follow-up/`, { method: "POST", cookie: grace, body: JSON.stringify({ pull: 42, markdown: FOLLOW_UP, sha: GUIDE_SHA }) });

    expect([source.status, saved.status]).toEqual([403, 403]);
    expect(replay.requests).toEqual([]);
  });

  // Proves a follow-up never lands where it mustn't: not on a closed or merged pull request, not on a branch that
  // isn't the submission's, and never over a change someone pushed since the editor loaded the file.
  it.each([
    ["the pull request is closed", [pullNow({ state: "closed" })], 409, "closed"],
    ["the pull request is merged", [pullNow({ state: "closed", merged: true })], 409, "closed"],
    ["the pull request comes from another branch", [pullNow({ ref: "main" })], 404, "not_found"],
    ["the pull request comes from a fork", [pullNow({ repo: "mallory/wikiplace.live" })], 404, "not_found"],
    ["the file changed on the branch since it loaded", [pullNow(), ...committerExchanges, branchHead, blobOnBranch(OTHER_SHA)], 409, "changed"],
  ] as const)("refuses a follow-up when %s, writing nothing", async (_case, exchanges, status, error) => {
    const site = await createSite();
    const grace = await graceSubmits(site);
    await site.settle();
    const replay = replayGitHub(exchanges, INSTALLATION_TOKEN);

    const answer = await site.request(`${BASE}/follow-up/`, { method: "POST", cookie: grace, body: JSON.stringify({ pull: 42, markdown: FOLLOW_UP, sha: GUIDE_SHA }) });

    expect(answer.status).toBe(status);
    expect(await answer.json()).toMatchObject({ error });
    expect(replay.pending).toEqual([]);
    expect(replay.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  });
});

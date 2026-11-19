/**
 * GitHub sync and edit status: submissions behind Svartz's real server router, beside the real `auth` plugin, on a
 * real D1 from Miniflare. GitHub's deliveries are built from its documented webhook payloads and signed as GitHub
 * signs them; its REST answers are replayed.
 */
import { createHmac } from "node:crypto";
import type { Identity } from "@svartz/auth";
import { createServerHandle } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { permissions } from "../src/permissions";
import type { BuildData, ServerOptions } from "../src/server";
import type { SyncOptions } from "../src/sync";
import {
  API,
  APP_ID,
  APP_KEY,
  blobExchange,
  branchFor,
  BUILD_COMMIT,
  commitExchanges,
  committerExchanges,
  DIRECT_COMMIT,
  editExchanges,
  GUIDE_SHA,
  GUIDE_SOURCE,
  HEAD_COMMIT,
  headExchange,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  PULL_42,
  REPO,
  replayGitHub,
  repositoryExchange,
  SUBMISSION_ID,
  tokenExchange,
  type Exchange,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
const BASE = "/wiki/_svartz/submissions";
const AUTH = "/wiki/_svartz/auth";
const WEBHOOK = `${BASE}/github/webhook/`;
const SECRET = "whsec-0123456789abcdef";

const ADA: Identity = { id: "github:583231", provider: "github", name: "Ada Lovelace", handle: "ada" };
const GRACE: Identity = { id: "github:2", provider: "github", name: "Grace Hopper", handle: "grace" };
const MARKDOWN = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
const NOTE = "Added the time it takes.";
/** The commit that merged pull request #42, and a later commit on `main` that holds it. */
const MERGE_COMMIT = "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e";
const LATER_COMMIT = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";

const GUIDE = { link: "Guide", title: "Guide", slug: "guide", path: "guide.md", href: "/wiki/guide/" };
const BUILD: BuildData = {
  commit: BUILD_COMMIT,
  pages: { "/wiki/guide/": "content/guide.md" },
  routes: { guide: { slug: "guide", href: "/wiki/guide/" } },
  aliases: {},
  aliasesField: "aliases",
  vaultRoot: "content",
  folders: [""],
  links: [GUIDE],
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] },
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> } };
}

/**
 * A wiki at /wiki with `auth`, and `submissions` as a GitHub App syncing into `SVARTZ_DB`, where `live` decides live.
 * `branch` is the configured content branch; unset, it is the repository's default.
 */
async function createSite({ live = { workflow: "deploy.yml" } as SyncOptions["live"], admins = [ADA.id], branch = undefined as string | undefined } = {}) {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  const db = await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
  const options: ServerOptions = {
    repo: REPO,
    labels: [],
    app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
    guard: { rateLimit: { limit: 100, period: 60 } },
    mode: "permission",
    ...(branch ? { branch } : {}),
    sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live },
  };
  const handle = createServerHandle({
    basePath: "/wiki",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        id: "auth",
        eager: true,
        load: () => import("@svartz/auth/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } }, admins, permissions: permissions(false) },
      },
      { id: "submissions", load: () => import("../src/server"), options, data: BUILD },
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
  const request = (path: string, { cookie, method = "GET", body, headers = {} }: { cookie?: string; method?: string; body?: BodyInit; headers?: Record<string, string> } = {}) => {
    const sent = new Headers(headers);
    if (cookie) sent.set("cookie", cookie);
    if (method === "POST" && !sent.has("x-github-event")) sent.set("origin", ORIGIN);
    const req = new Request(`${ORIGIN}${path}`, { method, headers: sent, body });
    return handle({
      event: { request: req, url: new URL(req.url), getClientAddress: () => "203.0.113.7", platform: { ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } } },
      resolve: async () => new Response("page"),
    });
  };
  /** Wait for the work kept alive after every answer so far. */
  const settle = async () => {
    while (background.length > 0) await Promise.all(background.splice(0));
  };
  // Work still running when a test ends finishes before its database goes.
  disposers.unshift(settle);
  const rows = async (sql: string) => (await db.prepare(sql).bind().all()).results;
  return { request, settle, rows, db };
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
  const cookies = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookie: cookies(start).join("; ") });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookie: cookies(callback).join("; "), body: new URLSearchParams({ handle: person.handle! }) });
  vi.unstubAllGlobals();
  return cookies(chosen).find((pair) => pair.startsWith("__Host-svartz-session="))!;
}

/** Post `payload` as GitHub delivers event `event`, signed with `secret`; `signature` overrides the header. */
function deliver(site: Site, event: string, payload: unknown, { secret = SECRET, signature, body = JSON.stringify(payload) }: { secret?: string; signature?: string | null; body?: string } = {}) {
  const signed = `sha256=${createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "GitHub-Hookshot/7d9b1a4",
    "x-github-event": event,
    "x-github-delivery": crypto.randomUUID(),
  };
  if (signature !== null) headers["x-hub-signature-256"] = signature ?? signed;
  return site.request(WEBHOOK, { method: "POST", body, headers });
}

// Payloads as GitHub's webhook documentation describes them, trimmed to what a reader would recognise.
const repository = { id: 712_345, name: "wikiplace.live", full_name: REPO, owner: { login: "wikiplace", id: 9 }, private: false, default_branch: "main" };
const sender = { login: "ada", id: 583_231, type: "User" };
const at = (offsetSeconds = 0) => new Date(Date.now() + offsetSeconds * 1000).toISOString().replace(/\.\d+Z$/, "Z");

const pushed = (id: string, message: string, changes: { added?: string[]; removed?: string[]; modified?: string[] }) => ({
  id,
  tree_id: "0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e",
  distinct: true,
  message,
  timestamp: "2026-11-19T13:00:00+01:00",
  url: `https://github.com/${REPO}/commit/${id}`,
  author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example", username: "ada" },
  committer: { name: "wikiplace-editor[bot]", email: "41898282+wikiplace-editor[bot]@users.noreply.github.com" },
  added: [],
  removed: [],
  modified: [],
  ...changes,
});
const push = (commits: ReturnType<typeof pushed>[], ref = "refs/heads/main") => ({
  ref,
  before: HEAD_COMMIT,
  after: commits.at(-1)!.id,
  base_ref: null,
  created: false,
  deleted: false,
  forced: false,
  compare: `https://github.com/${REPO}/compare/${HEAD_COMMIT.slice(0, 12)}...${commits.at(-1)!.id.slice(0, 12)}`,
  commits,
  head_commit: commits.at(-1),
  pusher: { name: "ada", email: "ada@users.noreply.wiki.example" },
  repository,
  sender,
});

const pull = ({ state = "open", updated = at(), merged = null as string | null, mergeCommit = "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0" } = {}) => ({
  url: `https://api.github.com/repos/${REPO}/pulls/42`,
  id: 1_987_654,
  number: 42,
  state,
  title: "Edit content/guide.md",
  user: { login: "wikiplace-editor[bot]", id: 41_898_282, type: "Bot" },
  body: NOTE,
  html_url: PULL_42.html_url,
  created_at: "2026-11-19T11:00:00Z",
  updated_at: updated,
  closed_at: state === "closed" ? updated : null,
  merged_at: merged,
  merge_commit_sha: mergeCommit,
  draft: false,
  merged: merged !== null,
  head: { label: `wikiplace:${branchFor("wiki-guide")}`, ref: branchFor("wiki-guide"), sha: "a6e2a36b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b" },
  base: { label: "wikiplace:main", ref: "main", sha: HEAD_COMMIT },
});

const run = ({ id = 900, path = ".github/workflows/deploy.yml", head = DIRECT_COMMIT, status = "queued", conclusion = null as string | null, attempt = 1, updated = at(), created = at() } = {}) => ({
  id,
  name: path.endsWith("deploy.yml") ? "Deploy" : "CI",
  path,
  head_branch: "main",
  head_sha: head,
  event: "push",
  status,
  conclusion,
  run_attempt: attempt,
  html_url: `https://github.com/${REPO}/actions/runs/${id}`,
  created_at: created,
  updated_at: updated,
  run_started_at: created,
});
const workflowRun = (action: string, workflowRun: ReturnType<typeof run>) =>
  ({ action, workflow_run: workflowRun, workflow: { id: 161_335, name: workflowRun.name, path: workflowRun.path }, repository, sender });

const deploymentStatus = ({ id = 7, sha = DIRECT_COMMIT, environment = "production", statusId = 70, state = "success", created = at() } = {}) => ({
  action: "created",
  deployment: { id, sha, ref: "main", task: "deploy", environment, created_at: created, updated_at: created, creator: sender },
  deployment_status: {
    id: statusId,
    state,
    environment,
    log_url: `https://github.com/${REPO}/actions/runs/1234`,
    target_url: `https://github.com/${REPO}/actions/runs/1234`,
    environment_url: "https://wiki.example",
    created_at: at(),
    updated_at: at(),
    creator: sender,
  },
  repository,
  sender,
});

const issueComment = (action: string, updated: string) => ({
  action,
  issue: { number: 42, title: "Edit content/guide.md", state: "open", pull_request: { url: `https://api.github.com/repos/${REPO}/pulls/42`, html_url: PULL_42.html_url, merged_at: null } },
  comment: {
    id: 3_000_001,
    body: "Thanks! Could you cite a source?",
    user: { login: "grace", id: 2 },
    html_url: `${PULL_42.html_url}#issuecomment-3000001`,
    created_at: "2026-11-19T11:30:00Z",
    updated_at: updated,
  },
  repository,
  sender,
});

const reviewDelivery = (action: string, state: string) => ({
  action,
  review: {
    id: 4_000_001,
    user: { login: "grace", id: 2 },
    body: "Looks right.",
    commit_id: "a6e2a36b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b",
    submitted_at: "2026-11-19T11:40:00Z",
    state,
    html_url: `${PULL_42.html_url}#pullrequestreview-4000001`,
  },
  pull_request: pull({ updated: "2026-11-19T11:40:00Z" }),
  repository,
  sender,
});

/**
 * A GitHub that answers the reconcile poll with empty lists, and compare requests from `compare`: whether each head
 * is `ahead` of the commit asked about. `answer` overrides any request it answers, given the path below the
 * repository and the query. Answers every request it gets in `requests`.
 */
function quietGitHub(compare: Record<string, string> = {}, answer: (path: string, query: URLSearchParams) => Response | undefined = () => undefined) {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(`${url.pathname}${url.search}`);
    const path = url.pathname.slice(`/repos/${REPO}`.length);
    const overridden = answer(path, url.searchParams);
    if (overridden) return overridden;
    if (/^\/deployments\/\d+\/statuses$/.test(path)) return Response.json([]);
    const head = path.match(/^\/compare\/[0-9a-f]{40}\.\.\.([0-9a-f]{40})$/)?.[1];
    if (head) return Response.json({ status: compare[head] ?? "diverged", ahead_by: 1, behind_by: 0, commits: [], files: [] });
    if (path === "") return Response.json({ full_name: REPO, default_branch: "main" });
    if (path === "/actions/runs") return Response.json({ total_count: 0, workflow_runs: [] });
    if (["/deployments", "/pulls", "/commits", "/issues/comments", "/pulls/comments"].includes(path)) return Response.json([]);
    throw new Error(`GitHub got an unexpected GET ${url}`);
  }));
  return requests;
}

async function accountId({ rows }: Site, handle: string): Promise<string> {
  const [row] = await rows(`SELECT id FROM auth_accounts WHERE handle = '${handle}'`);
  return row!.id as string;
}

/** Ada, an admin, saves an edit of the guide, which commits {@link DIRECT_COMMIT} to `main`. Answers her cookie. */
async function adaCommits(site: Site): Promise<string> {
  const ada = await signIn(site, ADA);
  const replay = replayGitHub([
    tokenExchange(new Date(Date.now() + 60 * 60_000).toISOString()),
    ...committerExchanges,
    repositoryExchange,
    headExchange(),
    blobExchange("content/guide.md", HEAD_COMMIT, GUIDE_SHA),
    ...commitExchanges({
      path: "content/guide.md",
      markdown: MARKDOWN,
      message: `Edit content/guide.md\n\n${NOTE}\n\nCo-authored-by: Ada Lovelace <583231+ada@users.noreply.github.com>\nSvartz-Account: ${await accountId(site, "ada")}`,
      author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
    }),
  ], INSTALLATION_TOKEN);
  const response = await site.request(`${BASE}/edit/`, {
    method: "POST",
    cookie: ada,
    body: JSON.stringify({ submissionId: SUBMISSION_ID, page: "/wiki/guide/", markdown: MARKDOWN, note: NOTE, sha: GUIDE_SHA }),
  });
  expect(await response.json()).toMatchObject({ kind: "commit", sha: DIRECT_COMMIT });
  expect(replay.pending).toEqual([]);
  return ada;
}

/** Grace, a signed-in reader, saves an edit of the guide, which opens pull request #42. Answers her cookie. */
async function graceOpensPullRequest(site: Site): Promise<string> {
  const grace = await signIn(site, GRACE);
  const replay = replayGitHub([
    tokenExchange(new Date(Date.now() + 60 * 60_000).toISOString()),
    ...editExchanges({
      markdown: MARKDOWN,
      note: NOTE,
      pageUrl: `${ORIGIN}/wiki/guide/`,
      branch: branchFor("wiki-guide"),
      author: { name: "Grace Hopper", email: "2+grace@users.noreply.github.com" },
      credit: "by [Grace Hopper](<https://github.com/grace>) (signed in with GitHub)",
    }).filter(({ request }) => request.url !== `${API}/issues/42/labels`),
  ], INSTALLATION_TOKEN);
  const response = await site.request(`${BASE}/edit/`, {
    method: "POST",
    cookie: grace,
    body: JSON.stringify({ submissionId: SUBMISSION_ID, page: "/wiki/guide/", markdown: MARKDOWN, note: NOTE }),
  });
  expect(await response.json()).toMatchObject({ kind: "pull-request", number: 42 });
  expect(replay.pending).toEqual([]);
  return grace;
}

/** How the edit saved under {@link SUBMISSION_ID} is doing, asked as `cookie`, after the work the last answer left. */
async function status(site: Site, cookie?: string) {
  await site.settle();
  const response = await site.request(`${BASE}/status/?edit=${SUBMISSION_ID}`, { cookie });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("GitHub's deliveries", () => {
  it("stores the commits a signed push puts on the content branch that touch the vault, with their files in it", async () => {
    const site = await createSite();
    const inVault = "1111111111111111111111111111111111111111";
    const outside = "2222222222222222222222222222222222222222";
    const added = "3333333333333333333333333333333333333333";

    const delivered = await deliver(site, "push", push([
      pushed(inVault, "Edit content/guide.md\n\nAdded the time it takes.\n\nSvartz-Account: 0b9f6c1e", { modified: ["content/guide.md", "README.md"] }),
      pushed(outside, "Fix the build", { modified: ["src/app.ts"] }),
      pushed(added, "Add Charles Babbage", { added: ["content/People/Charles Babbage.md"], removed: ["content/old.md"] }),
    ]));
    // A submission's branch isn't the content.
    await deliver(site, "push", push([pushed("4444444444444444444444444444444444444444", "Edit", { modified: ["content/guide.md"] })], `refs/heads/${branchFor("wiki-guide")}`));

    expect(delivered.status).toBe(204);
    expect(await site.rows("SELECT sha, files, trailer_account, author_login, committed_at FROM submissions_commits ORDER BY sha")).toEqual([
      { sha: inVault, files: '["content/guide.md"]', trailer_account: "0b9f6c1e", author_login: "ada", committed_at: "2026-11-19T12:00:00.000Z" },
      { sha: added, files: '["content/People/Charles Babbage.md","content/old.md"]', trailer_account: null, author_login: "ada", committed_at: "2026-11-19T12:00:00.000Z" },
    ]);
  });

  it.each([
    ["no signature", { signature: null }],
    ["a signature made with another secret", { secret: "whsec-someone-else" }],
    ["a signature of another body", { body: JSON.stringify(push([pushed("5555555555555555555555555555555555555555", "Vandalism", { modified: ["content/guide.md"] })])) }],
    ["a SHA-1 signature", { signature: `sha1=${createHmac("sha1", SECRET).update("{}").digest("hex")}` }],
  ])("refuses a delivery with %s and stores nothing", async (_case, signing) => {
    const site = await createSite();

    const delivered = await deliver(site, "push", push([pushed("1111111111111111111111111111111111111111", "Edit", { modified: ["content/guide.md"] })]), signing);

    expect(delivered.status).toBe(401);
    expect(await delivered.json()).toMatchObject({ error: "bad_signature" });
    expect(await site.rows("SELECT name FROM sqlite_master WHERE name = 'submissions_commits'")).toEqual([]);
  });

  it("refuses a signed delivery for another repository and stores nothing", async () => {
    const site = await createSite();

    const delivered = await deliver(site, "push", {
      ...push([pushed("1111111111111111111111111111111111111111", "Edit", { modified: ["content/guide.md"] })]),
      repository: { ...repository, full_name: "mallory/wiki" },
    });

    expect(delivered.status).toBe(403);
    expect(await site.rows("SELECT name FROM sqlite_master WHERE name = 'submissions_commits'")).toEqual([]);
  });

  it("acknowledges the App's ping", async () => {
    const site = await createSite();

    const delivered = await deliver(site, "ping", { zen: "Design for failure.", hook_id: 109_948_940, hook: { type: "App", id: 109_948_940, app_id: APP_ID, events: ["push"] } });

    expect(delivered.status).toBe(202);
  });

  it("acknowledges a push that changes nothing the mirror keeps", async () => {
    const site = await createSite({ branch: "main" });

    const otherBranch = await deliver(site, "push", push([pushed("4444444444444444444444444444444444444444", "Edit", { modified: ["content/guide.md"] })], `refs/heads/${branchFor("wiki-guide")}`));
    const outsideVault = await deliver(site, "push", push([pushed("2222222222222222222222222222222222222222", "Fix the build", { modified: ["src/app.ts"] })]));

    expect([otherBranch.status, outsideVault.status]).toEqual([202, 202]);
    expect(await site.rows("SELECT sha FROM submissions_commits")).toEqual([]);
  });

  it("keeps each record's latest state whatever order deliveries arrive in, and a repeated delivery changes nothing", async () => {
    const site = await createSite();
    const merged = pull({ state: "closed", updated: "2026-11-19T12:00:00Z", merged: "2026-11-19T12:00:00Z", mergeCommit: MERGE_COMMIT });

    for (const [event, payload] of [
      ["pull_request", { action: "closed", number: 42, pull_request: merged, repository, sender }],
      ["pull_request", { action: "closed", number: 42, pull_request: merged, repository, sender }],
      ["pull_request", { action: "opened", number: 42, pull_request: pull({ updated: "2026-11-19T11:00:00Z" }), repository, sender }],
      ["pull_request_review", reviewDelivery("dismissed", "dismissed")],
      ["pull_request_review", reviewDelivery("submitted", "approved")],
      ["issue_comment", issueComment("deleted", "2026-11-19T11:35:00Z")],
      ["issue_comment", issueComment("created", "2026-11-19T11:30:00Z")],
      ["workflow_run", workflowRun("completed", run({ status: "completed", conclusion: "success", updated: "2026-11-19T12:05:00Z" }))],
      ["workflow_run", workflowRun("in_progress", run({ status: "in_progress", updated: "2026-11-19T12:02:00Z" }))],
      ["deployment_status", deploymentStatus({ statusId: 71, state: "success" })],
      ["deployment_status", deploymentStatus({ statusId: 70, state: "in_progress" })],
    ] as const) {
      expect((await deliver(site, event, payload)).status).toBe(204);
    }

    expect(await site.rows("SELECT number, state, merged_at, merge_commit, in_vault FROM submissions_pulls")).toEqual([
      { number: 42, state: "closed", merged_at: "2026-11-19T12:00:00.000Z", merge_commit: MERGE_COMMIT, in_vault: null },
    ]);
    expect(await site.rows("SELECT id, state FROM submissions_reviews")).toEqual([{ id: 4_000_001, state: "dismissed" }]);
    expect(await site.rows("SELECT kind, pull_number, body, deleted FROM submissions_comments")).toEqual([{ kind: "issue", pull_number: 42, body: "", deleted: 1 }]);
    expect(await site.rows("SELECT status, conclusion FROM submissions_runs")).toEqual([{ status: "completed", conclusion: "success" }]);
    expect(await site.rows("SELECT environment, state FROM submissions_deployments")).toEqual([{ environment: "production", state: "success" }]);
  });
});

describe("an edit's status", () => {
  it("follows a direct commit through its build, a failed attempt and a re-run, to live", async () => {
    const site = await createSite();
    const ada = await adaCommits(site);
    quietGitHub();
    const commit = { sha: DIRECT_COMMIT, url: `https://github.com/${REPO}/commit/${DIRECT_COMMIT}` };

    expect(await status(site, ada)).toEqual({ status: 200, body: { stage: "committed", commit } });
    // Another workflow's success says nothing about the site.
    await deliver(site, "workflow_run", workflowRun("completed", run({ id: 800, path: ".github/workflows/ci.yml", status: "completed", conclusion: "success" })));
    expect((await status(site, ada)).body).toMatchObject({ stage: "committed" });
    await deliver(site, "workflow_run", workflowRun("in_progress", run({ status: "in_progress" })));
    expect((await status(site, ada)).body).toMatchObject({ stage: "building" });
    await deliver(site, "workflow_run", workflowRun("completed", run({ status: "completed", conclusion: "failure", updated: at(60) })));
    expect((await status(site, ada)).body).toMatchObject({ stage: "failed" });
    await deliver(site, "workflow_run", workflowRun("in_progress", run({ status: "in_progress", attempt: 2, updated: at(120) })));
    expect((await status(site, ada)).body).toMatchObject({ stage: "building" });
    await deliver(site, "workflow_run", workflowRun("completed", run({ status: "completed", conclusion: "success", attempt: 2, updated: at(180) })));
    expect(await status(site, ada)).toEqual({ status: 200, body: { stage: "live", commit } });
  });

  it("follows a pull request from review through its merge to live, once GitHub confirms the deployment holds it", async () => {
    const site = await createSite({ live: { environment: "production" } });
    const grace = await graceOpensPullRequest(site);
    const requests = quietGitHub({ [LATER_COMMIT]: "ahead" });
    const pullRequest = { number: 42, url: PULL_42.html_url };

    expect(await status(site, grace)).toEqual({ status: 200, body: { stage: "open", pull: pullRequest } });
    await deliver(site, "pull_request", { action: "closed", number: 42, pull_request: pull({ state: "closed", updated: at(), merged: at(), mergeCommit: MERGE_COMMIT }), repository, sender });
    const commit = { sha: MERGE_COMMIT, url: `https://github.com/${REPO}/commit/${MERGE_COMMIT}` };
    expect((await status(site, grace)).body).toEqual({ stage: "committed", pull: pullRequest, commit });
    // Staging isn't live.
    await deliver(site, "deployment_status", deploymentStatus({ id: 6, sha: MERGE_COMMIT, environment: "staging", statusId: 60 }));
    expect((await status(site, grace)).body).toMatchObject({ stage: "committed" });
    // Deployed from a later commit: live only once GitHub says that commit holds the merge.
    await deliver(site, "deployment_status", deploymentStatus({ id: 7, sha: LATER_COMMIT, statusId: 70 }));
    expect((await status(site, grace)).body).toMatchObject({ stage: "committed" });
    expect((await status(site, grace)).body).toEqual({ stage: "live", pull: pullRequest, commit });
    expect(requests.filter((path) => path.includes("/compare/"))).toEqual([`/repos/${REPO}/compare/${MERGE_COMMIT}...${LATER_COMMIT}?per_page=1`]);
  });

  it("never calls an edit live on a deployment GitHub says doesn't hold it", async () => {
    const site = await createSite({ live: { environment: "production" } });
    const ada = await adaCommits(site);
    // A rollback to an older commit.
    quietGitHub({ [HEAD_COMMIT]: "behind" });

    await deliver(site, "deployment_status", deploymentStatus({ sha: HEAD_COMMIT }));

    expect((await status(site, ada)).body).toMatchObject({ stage: "committed" });
    expect((await status(site, ada)).body).toMatchObject({ stage: "committed" });
  });

  it.each([
    ["failed, then was deactivated", [{ statusId: 70, state: "failure" }, { statusId: 71, state: "inactive" }], "committed"],
    ["succeeded, then was deactivated, delivered out of order", [{ statusId: 71, state: "inactive" }, { statusId: 70, state: "success" }], "live"],
  ])("reads a deployment that %s by whether it ever succeeded", async (_case, statuses, stage) => {
    const site = await createSite({ live: { environment: "production" } });
    const ada = await adaCommits(site);
    quietGitHub();

    for (const delivered of statuses) await deliver(site, "deployment_status", deploymentStatus(delivered));

    expect((await status(site, ada)).body).toMatchObject({ stage });
  });

  it("finds that a failed deployment later succeeded, when its success was never delivered", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const site = await createSite({ live: { environment: "production" } });
    const ada = await adaCommits(site);
    const failure = { ...deploymentStatus({ statusId: 70, state: "failure" }).deployment_status };
    let statuses: unknown[] = [failure];
    quietGitHub({}, (path) => (path === "/deployments/7/statuses" ? Response.json(statuses) : undefined));

    await deliver(site, "deployment_status", deploymentStatus({ statusId: 70, state: "failure" }));
    expect((await status(site, ada)).body).toMatchObject({ stage: "failed" });

    // A re-run succeeds; its delivery is lost.
    statuses = [{ ...failure, id: 71, state: "success" }, failure];
    vi.setSystemTime(Date.now() + 61_000);
    await status(site, ada);
    expect((await status(site, ada)).body).toMatchObject({ stage: "live" });
  });

  it("says a pull request closed without merging is closed", async () => {
    const site = await createSite();
    const grace = await graceOpensPullRequest(site);
    quietGitHub();

    await deliver(site, "pull_request", { action: "closed", number: 42, pull_request: pull({ state: "closed", updated: at() }), repository, sender });

    expect((await status(site, grace)).body).toEqual({ stage: "closed", pull: { number: 42, url: PULL_42.html_url } });
  });

  it("tells only the reader who saved an edit how it is doing", async () => {
    const site = await createSite();
    await adaCommits(site);
    const grace = await signIn(site, GRACE);
    const requests = quietGitHub();

    expect(await status(site, grace)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await status(site)).toMatchObject({ status: 401, body: { error: "sign_in_required" } });
    await site.settle();
    // Neither asked GitHub anything.
    expect(requests).toEqual([]);
  });
});

describe("the reconcile poll", () => {
  /** The poll's conditional list requests, in order, each sending `etag` when given one. */
  const lists = [
    `${API}/actions/runs?branch=main&per_page=100`,
    `${API}/deployments?environment=production&per_page=100`,
    `${API}/pulls?state=all&base=main&sort=updated&direction=desc&per_page=100`,
    `${API}/commits?sha=main&path=content&per_page=100`,
    `${API}/issues/comments?sort=updated&direction=desc&per_page=100`,
    `${API}/pulls/comments?sort=updated&direction=desc&per_page=100`,
  ];
  const etag = (index: number) => `W/"list-${index}"`;

  it("backfills on the first read of a stale mirror, then asks again only after a minute, conditionally", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const site = await createSite({ live: { environment: "production" } });
    const ada = await adaCommits(site);
    const merged = pull({ state: "closed", updated: "2026-11-19T12:00:00Z", merged: "2026-11-19T12:00:00Z", mergeCommit: MERGE_COMMIT });
    const answers = [
      { workflow_runs: [] },
      [{ id: 7, sha: DIRECT_COMMIT, ref: "main", environment: "production", created_at: at(30) }],
      [merged],
      [{
        sha: DIRECT_COMMIT,
        html_url: `https://github.com/${REPO}/commit/${DIRECT_COMMIT}`,
        commit: { message: "Edit content/guide.md", author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example", date: "2026-11-19T12:00:00Z" }, committer: { name: "wikiplace-editor[bot]", email: "41898282+wikiplace-editor[bot]@users.noreply.github.com", date: "2026-11-19T12:00:00Z" } },
        author: { login: "ada", id: 583_231 },
      }],
      // A comment on pull request #42, and one on an issue, which isn't a pull request.
      [issueComment("created", "2026-11-19T11:30:00Z").comment, { ...issueComment("created", "2026-11-19T11:30:00Z").comment, id: 3_000_002, html_url: `https://github.com/${REPO}/issues/7#issuecomment-3000002` }],
      [],
    ];
    const replay = replayGitHub([
      { request: { method: "GET", url: API }, response: { status: 200, json: { full_name: REPO, default_branch: "main" } } },
      ...lists.map((url, index): Exchange => ({ request: { method: "GET", url }, response: { status: 200, json: answers[index], headers: { etag: etag(index) } } })),
      // Live, and since replaced by a later deployment.
      { request: { method: "GET", url: `${API}/deployments/7/statuses?per_page=100` }, response: { status: 200, json: [{ ...deploymentStatus().deployment_status, id: 71, state: "inactive" }, deploymentStatus().deployment_status] } },
      { request: { method: "GET", url: `${API}/pulls/42/files?per_page=100&page=1` }, response: { status: 200, json: [{ filename: "content/guide.md", status: "modified" }] } },
      { request: { method: "GET", url: `${API}/pulls/42/reviews?per_page=100` }, response: { status: 200, json: [{ ...reviewDelivery("submitted", "APPROVED").review }] } },
      { request: { method: "GET", url: `${API}/commits/${DIRECT_COMMIT}` }, response: { status: 200, json: { sha: DIRECT_COMMIT, files: [{ filename: "content/guide.md" }, { filename: "README.md" }] } } },
    ], INSTALLATION_TOKEN);

    await status(site, ada);
    expect((await status(site, ada)).body).toMatchObject({ stage: "live" });
    expect(replay.pending).toEqual([]);
    expect(await site.rows("SELECT sha, files FROM submissions_commits")).toEqual([{ sha: DIRECT_COMMIT, files: '["content/guide.md"]' }]);
    expect(await site.rows("SELECT number, in_vault, merge_commit FROM submissions_pulls")).toEqual([{ number: 42, in_vault: 1, merge_commit: MERGE_COMMIT }]);
    expect(await site.rows("SELECT id, state FROM submissions_reviews")).toEqual([{ id: 4_000_001, state: "approved" }]);
    expect(await site.rows("SELECT id, pull_number FROM submissions_comments")).toEqual([{ id: 3_000_001, pull_number: 42 }]);

    // Within the minute: nothing. After it: every list once more, with its ETag, and nothing left to fill in.
    const again = replayGitHub(lists.map((url, index): Exchange => ({ request: { method: "GET", url, ifNoneMatch: etag(index) }, response: { status: 304 } })), INSTALLATION_TOKEN);
    await status(site, ada);
    await site.settle();
    expect(again.requests).toEqual([]);
    vi.setSystemTime(Date.now() + 61_000);
    await status(site, ada);
    await site.settle();
    expect(again.pending).toEqual([]);
  });

  it("stops when GitHub's allowance runs low, and polls again only after it resets", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const site = await createSite();
    const ada = await adaCommits(site);
    const reset = Math.floor(Date.now() / 1000) + 30 * 60;
    const repositoryAnswer = { full_name: REPO, default_branch: "main" };
    const low = replayGitHub([
      { request: { method: "GET", url: API }, response: { status: 200, json: repositoryAnswer, headers: { "x-ratelimit-remaining": "40", "x-ratelimit-reset": String(reset) } } },
    ], INSTALLATION_TOKEN);

    await status(site, ada);
    await site.settle();
    expect(low.pending).toEqual([]);

    vi.setSystemTime(Date.now() + 5 * 60_000);
    await status(site, ada);
    await site.settle();
    expect(low.requests).toHaveLength(1);

    // The first poll learnt the branch, so this one starts at the lists; a spent allowance stops it again.
    vi.setSystemTime((reset + 1) * 1000);
    const after = replayGitHub([
      { request: { method: "GET", url: `${API}/actions/runs?branch=main&per_page=100` }, response: { status: 403, json: { message: "API rate limit exceeded" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset + 3600) } } },
    ], INSTALLATION_TOKEN);
    await status(site, ada);
    await site.settle();
    expect(after.pending).toEqual([]);
  });
});

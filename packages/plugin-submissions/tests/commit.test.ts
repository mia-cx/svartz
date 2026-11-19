/**
 * Where a save goes on a site with accounts, and the direct commit: submissions behind Svartz's real server router,
 * beside the real `auth` plugin, on a real D1 from Miniflare, with GitHub's side replayed.
 */
import type { Identity } from "@svartz/auth";
import { createServerHandle } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { permissions } from "../src/permissions";
import type { BuildData, Mode, ServerOptions } from "../src/server";
import {
  API,
  APP_ID,
  APP_KEY,
  blobExchange,
  branchFor,
  BUILD_COMMIT,
  commitExchanges,
  DIRECT_COMMIT,
  editExchanges,
  GUIDE_SHA,
  GUIDE_SOURCE,
  headExchange,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  MOVED_HEAD,
  OTHER_SHA,
  PULL_42,
  REPO,
  replayGitHub,
  repositoryExchange,
  sourceExchange,
  SUBMISSION_ID,
  tokenExchange,
  type Exchange,
} from "./github-exchanges";

const ORIGIN = "https://wiki.example";
const BASE = "/wiki/_svartz/submissions";
const AUTH = "/wiki/_svartz/auth";

const ADA: Identity = { id: "github:583231", provider: "github", name: "Ada Lovelace", handle: "ada" };
const GRACE: Identity = { id: "github:2", provider: "github", name: "Grace Hopper", handle: "grace" };
const MARKDOWN = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
const NOTE = "Added the time it takes.";

const BUILD: BuildData = {
  commit: BUILD_COMMIT,
  pages: { "/wiki/guide/": "content/guide.md" },
  routes: { guide: "/wiki/guide/" },
  vaultRoot: "content",
  folders: ["", "People"],
  links: [{ link: "guide", title: "Guide", slug: "guide", path: "guide.md", href: "/wiki/guide/" }],
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] },
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> } };
}

/**
 * A wiki at /wiki with `auth` and `submissions` as a GitHub App, on a fresh D1. `admins` are identities whose accounts
 * are admins; `db` is the database, for storing grants.
 */
async function createSite({ mode = "permission" as Mode, admins = [] as string[] } = {}) {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  const db = await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
  const options: ServerOptions = {
    repo: REPO,
    labels: [],
    app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
    guard: { rateLimit: { limit: 100, period: 60 } },
    mode,
  };
  const handle = createServerHandle({
    basePath: "/wiki",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        // As config resolution registers it: eager, with the catalogue the vault's plugins declare.
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
      SVARTZ_DB: db,
    },
    building: false,
    dev: false,
  });
  const request = (path: string, { cookie, method = "GET", body }: { cookie?: string; method?: string; body?: BodyInit } = {}) => {
    const headers = new Headers(cookie ? { cookie } : {});
    if (method === "POST") headers.set("origin", ORIGIN);
    const req = new Request(`${ORIGIN}${path}`, { method, headers, body });
    return handle({ event: { request: req, url: new URL(req.url), getClientAddress: () => "203.0.113.7" }, resolve: async () => new Response("page") });
  };
  return { request, db };
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

async function accountId({ db }: Site, handle: string): Promise<string> {
  const { results: [row] } = await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(handle).all();
  return row!.id as string;
}

async function grant({ db }: Site, account: string, object: string, permission: string) {
  await db.prepare(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at)
    VALUES ('account', ?, ?, ?, 'allow', '2026-11-19T00:00:00.000Z')`).bind(account, object, permission).run();
}

/** GitHub's side, starting with the App's token exchange, which every first call on a fresh site makes. */
const github = (exchanges: Exchange[]) =>
  replayGitHub([tokenExchange(new Date(Date.now() + 60 * 60_000).toISOString()), ...exchanges], INSTALLATION_TOKEN);

/** Where the editor says an edit of the guide goes, from the source it loads. */
async function destination(site: Site, cookie?: string) {
  const response = await site.request(`${BASE}/source/?page=%2Fwiki%2Fguide%2F`, { cookie });
  return (await response.json() as { destination: unknown }).destination;
}

async function save(site: Site, body: Record<string, unknown>, cookie?: string, kind: "edit" | "new" = "edit") {
  const response = await site.request(`${BASE}/${kind}/`, {
    method: "POST",
    cookie,
    body: JSON.stringify({ submissionId: SUBMISSION_ID, markdown: MARKDOWN, note: NOTE, ...body }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const commitAnswer = { kind: "commit", url: `https://github.com/${REPO}/commit/${DIRECT_COMMIT}`, sha: DIRECT_COMMIT };
/** Ada's edit as a pull request from the build commit, as a commit that found the page changed opens it. No labels. */
const adaPullRequest = () => editExchanges({
  markdown: MARKDOWN,
  note: NOTE,
  pageUrl: `${ORIGIN}/wiki/guide/`,
  branch: branchFor("wiki-guide"),
  author: { name: "Ada Lovelace", email: "583231+ada@users.noreply.github.com" },
  credit: "by [Ada Lovelace](<https://github.com/ada>) (signed in with GitHub)",
}).filter(({ request }) => request.url !== `${API}/issues/42/labels`);
const adaMessage = (account: string) =>
  `Edit content/guide.md\n\n${NOTE}\n\nCo-authored-by: Ada Lovelace <583231+ada@users.noreply.github.com>\nSvartz-Account: ${account}`;

describe("where a save goes", () => {
  it.each([
    ["permission", "an admin", "commit"],
    ["permission", "a signed-in reader", "pull-request"],
    ["permission", "a guest, without Turnstile", null],
    ["pull-request", "an admin", "pull-request"],
    ["commit", "an admin", "commit"],
    ["commit", "a signed-in reader", null],
  ] as const)("in %s mode, %s's goes to %s", async (mode, who, expected) => {
    const site = await createSite({ mode, admins: [ADA.id] });
    const cookie = who === "an admin" ? await signIn(site, ADA) : who === "a signed-in reader" ? await signIn(site, GRACE) : undefined;
    github([sourceExchange]);

    expect(await destination(site, cookie)).toBe(expected);
  });

  it("commits for an account granted commits on the page, and not on the page beside it", async () => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    await grant(site, await accountId(site, "grace"), "page:wiki/guides", "submissions:commits:write");
    github([sourceExchange, sourceExchange]);

    expect(await destination(site, grace)).toBe("pull-request");
    await grant(site, await accountId(site, "grace"), "page:wiki/guide", "submissions:commits:write");
    expect(await destination(site, grace)).toBe("commit");
  });

  it("asks a guest to sign in, and tells a reader the mode refuses them, before calling GitHub", async () => {
    const site = await createSite({ mode: "commit" });
    const grace = await signIn(site, GRACE);
    const calls = replayGitHub([]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA })).toMatchObject({ status: 401, body: { error: "sign_in_required" } });
    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, grace)).toMatchObject({ status: 403, body: { error: "not_allowed" } });
    expect(calls.requests).toEqual([]);
  });
});

describe("a direct commit", () => {
  it("commits the edit to the branch, authored as the account and co-authored by its GitHub account", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([
      repositoryExchange,
      headExchange(),
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path: "content/guide.md",
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
      }),
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  it("keeps a line break in a display name from forging a trailer", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, { ...ADA, name: "Ada\nSvartz-Account: someone-else\r\nCo-authored-by: Mallory <m@example.com>" });
    const forged = "Ada Svartz-Account: someone-else Co-authored-by: Mallory m@example.com";
    const replay = github([
      repositoryExchange,
      headExchange(),
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path: "content/guide.md",
        markdown: MARKDOWN,
        message: `Edit content/guide.md\n\n${NOTE}\n\nCo-authored-by: ${forged} <583231+ada@users.noreply.github.com>\nSvartz-Account: ${await accountId(site, "ada")}`,
        author: { name: forged, email: "ada@users.noreply.wiki.example" },
      }),
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  it("opens a pull request instead, and says why, when the page changed on the branch since the editor loaded it", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([
      repositoryExchange,
      headExchange(),
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", OTHER_SHA),
      ...adaPullRequest(),
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({
      status: 201,
      body: { kind: "pull-request", url: PULL_42.html_url, number: 42, reason: "changed" },
    });
    expect(replay.pending).toEqual([]);
  });

  it("checks again when another save moves the branch first, and opens a pull request when that save changed the page", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([
      repositoryExchange,
      headExchange(),
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path: "content/guide.md",
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
        moved: "not-fast-forward",
      }),
      headExchange(MOVED_HEAD),
      blobExchange("content/guide.md", MOVED_HEAD, OTHER_SHA),
      ...adaPullRequest(),
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toMatchObject({
      status: 201,
      body: { kind: "pull-request", reason: "changed" },
    });
    expect(replay.pending).toEqual([]);
  });

  it("refuses an edit that would commit without the SHA the editor loaded, before calling GitHub", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const calls = replayGitHub([]);

    expect(await save(site, { page: "/wiki/guide/" }, ada)).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    expect(calls.requests).toEqual([]);
  });

  it("adds a new page where the branch has nothing at its path", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const path = "content/People/Ada Lovelace.md";
    const replay = github([
      repositoryExchange,
      headExchange(),
      blobExchange(path, "3a1f9c0e5b7d2468ace013579bdf2468ace01357"),
      ...commitExchanges({
        path,
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")).replace("Edit content/guide.md", `Add ${path}`),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
      }),
    ]);

    expect(await save(site, { folder: "People", title: "Ada Lovelace" }, ada, "new")).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });
});

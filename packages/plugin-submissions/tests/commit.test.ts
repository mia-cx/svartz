/**
 * Where a save goes on a site with accounts, and the direct commit: submissions behind Svartz's real server router,
 * beside the real `auth` plugin, on a real D1 from Miniflare, with GitHub's side replayed.
 */
import type { Identity } from "@svartz/auth";
import { createServerHandle } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSha } from "../src/github";
import { migrate } from "../src/mirror";
import { permissions } from "../src/permissions";
import type { BuildData, Mode, ServerOptions } from "../src/server";
import {
  API,
  APP_BOT,
  APP_ID,
  APP_KEY,
  blobExchange,
  branchFor,
  ancestryExchange,
  closeExchange,
  BUILD_COMMIT,
  commitExchanges,
  committerExchanges,
  DIRECT_COMMIT,
  editExchanges,
  GUIDE_SHA,
  GUIDE_SOURCE,
  headExchange,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  MOVED_HEAD,
  newPageExchanges,
  OTHER_SHA,
  PULL_42,
  pullExchange,
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

/** A published note in the vault at `path`, with the slug its file name gives it. */
const published = (path: string, title: string) => {
  const slug = path.slice(0, -".md".length).toLowerCase().replaceAll(" ", "-");
  return { link: title, title, slug, path, href: `/wiki/${slug}/` };
};
const NOTES = [
  published("guide.md", "Guide"),
  published("People/Ada Lovelace.md", "Ada Lovelace"),
  published("users/ada.md", "ada"),
  published("users/grace.md", "grace"),
];
const holder = (slug: string) => ({ slug, href: `/wiki/${slug}/` });

/** The guide, a page in `People/`, and Ada's and Grace's user pages, with the aliases `Lady Lovelace` and `Amazing Grace`. */
const BUILD: BuildData = {
  commit: BUILD_COMMIT,
  pages: Object.fromEntries(NOTES.map(({ href, path }) => [href, `content/${path}`])),
  routes: Object.fromEntries(NOTES.map(({ slug }) => [slug, holder(slug)])),
  aliases: { "lady-lovelace": holder("users/ada"), "amazing-grace": holder("users/grace") },
  aliasesField: "aliases",
  vaultRoot: "content",
  folders: ["", "People", "users"],
  links: NOTES,
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [] },
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> } };
}

/**
 * A wiki at /wiki with `auth` and `submissions` as a GitHub App, on a fresh D1. `admins` are identities whose accounts
 * are admins; `userPages` is auth's user page folder, in `userPageVault`, the vault that runs sign-in; `build` what the
 * submissions build recorded; `db` is the database, for storing grants, or another site's to share it. `sync` keeps
 * the mirror, and the site's record of each save, in `SVARTZ_DB`; `vault` is the vault's id.
 */
async function createSite({
  mode = "permission" as Mode, admins = [] as string[], userPages = undefined as string | undefined, userPageVault = "wiki", build = BUILD,
  sync = false, vault = "wiki", db = undefined as Database | undefined,
} = {}) {
  if (!db) {
    const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
    disposers.push(() => miniflare.dispose());
    db = await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
  }
  const options: ServerOptions = {
    repo: REPO,
    labels: [],
    app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
    guard: { rateLimit: { limit: 100, period: 60 } },
    mode,
    ...sync && { sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } } },
  };
  const handle = createServerHandle({
    basePath: "/wiki",
    vault: { id: vault, mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        // As config resolution registers it: eager, with the catalogue the vault's plugins declare.
        id: "auth",
        eager: true,
        load: () => import("@svartz/auth/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins,
          permissions: permissions(false),
          userPageVault,
          ...userPages && { userPages },
        },
      },
      { id: "submissions", load: () => import("../src/server"), options, data: build },
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
/** What a commit's first look at GitHub is, on a fresh worker: the App's bot user, the branch, and its head. */
const commitStart = [...committerExchanges, repositoryExchange, headExchange()];

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
  it("commits the edit to the branch, authored as the account, co-authored by its GitHub account and committed by the App", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const commit = commitExchanges({
      path: "content/guide.md",
      markdown: MARKDOWN,
      message: adaMessage(await accountId(site, "ada")),
      author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
    });
    const replay = github([
      ...commitStart,
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commit,
      // The worker's second commit names the same bot without looking it up again.
      repositoryExchange,
      headExchange(),
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commit,
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
    const commits = replay.requests.filter(({ method, url }) => method === "POST" && url === `${API}/git/commits`);
    expect(commits.map(({ body }) => body)).toEqual(Array(2).fill(expect.objectContaining({
      author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
      committer: { name: "wikiplace-editor[bot]", email: "41898282+wikiplace-editor[bot]@users.noreply.github.com" },
      message: expect.stringMatching(/\n\nCo-authored-by: Ada Lovelace <583231\+ada@users\.noreply\.github\.com>\nSvartz-Account: \S+$/),
    })));
  });

  it("answers the commit that holds the edit when a retry finds it on the branch already", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([
      ...commitStart,
      // The first attempt's answer was lost; its commit is the head.
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", await blobSha(MARKDOWN)),
      {
        // Read from the head checked, so a save landing meanwhile can't answer for this one.
        request: { method: "GET", url: `${API}/commits?sha=3a1f9c0e5b7d2468ace013579bdf2468ace01357&path=content%2Fguide.md&per_page=1` },
        response: { status: 200, json: [{ sha: DIRECT_COMMIT, html_url: commitAnswer.url }] },
      },
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  // Proves a save GitHub committed is recorded even when the branch move's answer never arrived: the branch's head says
  // it moved. Otherwise the save fails, its retry finds the content on the branch and records nothing either, and the
  // account has no edit to follow and no credit for it. A branch that moved on past it holds it too; a head that doesn't
  // still fails the save.
  it.each([
    ["records the commit as made when the branch is at it", DIRECT_COMMIT, [], { status: 201, body: commitAnswer }, [DIRECT_COMMIT]],
    ["records the commit as made when the branch has moved on past it", MOVED_HEAD, [ancestryExchange(DIRECT_COMMIT, MOVED_HEAD, "ahead")],
      { status: 201, body: commitAnswer }, [DIRECT_COMMIT]],
    ["fails the save when the branch doesn't hold it", MOVED_HEAD, [ancestryExchange(DIRECT_COMMIT, MOVED_HEAD, "diverged")],
      { status: 503, body: expect.objectContaining({ error: "github_unavailable" }) }, []],
  ])("reads the branch once after a move GitHub never answered, and %s", async (_case, head, ancestry, answer, recorded) => {
    const site = await createSite({ admins: [ADA.id], sync: true });
    const ada = await signIn(site, ADA);
    const replay = github([
      ...commitStart,
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path: "content/guide.md",
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
        moved: "lost",
      }),
      headExchange(head),
      ...ancestry,
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual(answer);
    expect(replay.pending).toEqual([]);
    await migrate(site.db);
    const { results } = await site.db.prepare("SELECT commit_sha FROM submissions_edits").all<{ commit_sha: string }>();
    expect(results.map(({ commit_sha }) => commit_sha)).toEqual(recorded);
  });

  it("opens a pull request instead, and says why, when a rule for the branch refuses the commit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([
      ...commitStart,
      blobExchange("content/guide.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path: "content/guide.md",
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
        moved: "protected",
      }),
      // The branch stayed put, so no other save got there first: a rule refused it.
      headExchange(),
      ...adaPullRequest(),
    ]);

    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, ada)).toEqual({
      status: 201,
      body: { kind: "pull-request", url: PULL_42.html_url, number: 42, reason: "protected" },
    });
    expect(replay.pending).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Repository rule violations found"));
  });

  it("keeps a line break in a display name from forging a trailer", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, { ...ADA, name: "Ada\nSvartz-Account: someone-else\r\nCo-authored-by: Mallory <m@example.com>" });
    const forged = "Ada Svartz-Account: someone-else Co-authored-by: Mallory m@example.com";
    const replay = github([
      ...commitStart,
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
      ...commitStart,
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
      ...commitStart,
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
    const path = "content/People/Charles Babbage.md";
    const replay = github([
      ...commitStart,
      blobExchange(path, "3a1f9c0e5b7d2468ace013579bdf2468ace01357"),
      ...commitExchanges({
        path,
        markdown: MARKDOWN,
        message: adaMessage(await accountId(site, "ada")).replace("Edit content/guide.md", `Add ${path}`),
        author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" },
      }),
    ]);

    expect(await save(site, { folder: "People", title: "Charles Babbage" }, ada, "new")).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });
});

describe("a group's trust", () => {
  const HEDY: Identity = { id: "github:3", provider: "github", name: "Hedy Lamarr", handle: "hedy" };
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);
  const directCommit = async (site: Site, person: Identity, path: string) => {
    const handle = person.handle!;
    return [
      blobExchange(path, "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
      ...commitExchanges({
        path,
        markdown: MARKDOWN,
        message: `Edit ${path}\n\n${NOTE}\n\nCo-authored-by: ${person.name} <${person.id.split(":")[1]}+${handle}@users.noreply.github.com>\nSvartz-Account: ${await accountId(site, handle)}`,
        author: { name: person.name, email: `${handle}@users.noreply.wiki.example` },
      }),
    ];
  };

  // Proves stories 21 and 22 end to end: Grace owns the Compilers and Hedy joined them through auth's routes; an admin
  // granted the group commits on `People/` and linked it to the guide. Hedy's save in `People/` commits, her save of the
  // guide opens a pull request, and Grace's save of the guide commits by the owner override.
  it("commits a member's save where the group may commit and an owner's where it is linked, and sends the rest to review", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const [ada, grace, hedy] = [await signIn(site, ADA), await signIn(site, GRACE), await signIn(site, HEDY)];
    const auth = (route: string, cookie: string, fields: Record<string, string>) =>
      site.request(`${AUTH}/${route}`, { method: "POST", cookie, body: form(fields) });
    await auth("groups/", grace, { name: "compilers", "display-name": "Compilers" });
    await auth("groups/compilers/invite/", grace, { handle: "hedy" });
    await auth("groups/compilers/accept/", hedy, {});
    await auth("people/grant/", ada, { "actor-type": "group", actor: "compilers", permission: "submissions:commits:write", scope: "vault:wiki", path: "people/", value: "allow" });
    await auth("groups/link/", ada, { group: "compilers", scope: "vault:wiki", path: "guide" });

    const review = github(editExchanges({
      markdown: MARKDOWN,
      note: NOTE,
      pageUrl: `${ORIGIN}/wiki/guide/`,
      branch: branchFor("wiki-guide"),
      author: { name: "Hedy Lamarr", email: "3+hedy@users.noreply.github.com" },
      credit: "by [Hedy Lamarr](<https://github.com/hedy>) (signed in with GitHub)",
    }).filter(({ request }) => request.url !== `${API}/issues/42/labels`));
    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, hedy)).toEqual({
      status: 201, body: { kind: "pull-request", url: PULL_42.html_url, number: 42 },
    });
    expect(review.pending).toEqual([]);

    const member = replayGitHub([...commitStart, ...await directCommit(site, HEDY, "content/People/Ada Lovelace.md")], INSTALLATION_TOKEN);
    expect(await save(site, { page: "/wiki/people/ada-lovelace/", sha: GUIDE_SHA }, hedy)).toEqual({ status: 201, body: commitAnswer });
    expect(member.pending).toEqual([]);

    const owner = replayGitHub([repositoryExchange, headExchange(), ...await directCommit(site, GRACE, "content/guide.md")], INSTALLATION_TOKEN);
    expect(await save(site, { page: "/wiki/guide/", sha: GUIDE_SHA }, grace)).toEqual({ status: 201, body: commitAnswer });
    expect(owner.pending).toEqual([]);
  });
});

describe("a commit's claim on routes", () => {
  const GRACE_PAGE = "/wiki/users/grace/";
  const graceAuthor = { name: "Grace Hopper", email: "2+grace@users.noreply.github.com" };
  const graceCredit = "by [Grace Hopper](<https://github.com/grace>) (signed in with GitHub)";
  /** Grace's edit of her user page as a pull request from the build commit. No labels. */
  const gracePullRequest = (markdown: string) => editExchanges({
    path: "content/users/grace.md",
    markdown,
    note: NOTE,
    pageUrl: `${ORIGIN}${GRACE_PAGE}`,
    branch: branchFor("wiki-users-grace"),
    author: graceAuthor,
    credit: graceCredit,
  }).filter(({ request }) => request.url !== `${API}/issues/42/labels`);
  /** Grace's edit of her user page, committed straight to the branch. */
  const graceCommit = async (site: Site, markdown: string) => [
    ...commitStart,
    blobExchange("content/users/grace.md", "3a1f9c0e5b7d2468ace013579bdf2468ace01357", GUIDE_SHA),
    ...commitExchanges({
      path: "content/users/grace.md",
      markdown,
      message: `Edit content/users/grace.md\n\n${NOTE}\n\nCo-authored-by: Grace Hopper <2+grace@users.noreply.github.com>\nSvartz-Account: ${await accountId(site, "grace")}`,
      author: { name: "Grace Hopper", email: "grace@users.noreply.wiki.example" },
    }),
  ];

  it.each([
    ["takes Ada's route with its slug", "---\nslug: ada\n---\nI control this page now.\n"],
    ["redirects from Ada's route with an alias", "---\naliases: [users/ada]\n---\nGrace.\n"],
    ["takes the redirect Ada's alias holds", "---\nalias: Lady Lovelace\n---\nGrace.\n"],
    ["redirects from a route nobody holds with its permalink", "---\npermalink: /start-here/\n---\nGrace.\n"],
    ["sets a slug the build refuses", "---\nslug: index\n---\nGrace.\n"],
  ])("sends the owner of a user page to review, committing nothing, when her edit %s", async (_, markdown) => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    const replay = github(gracePullRequest(markdown));

    expect(await save(site, { page: GRACE_PAGE, sha: GUIDE_SHA, markdown }, grace)).toEqual({
      status: 201,
      body: { kind: "pull-request", url: PULL_42.html_url, number: 42, reason: "route" },
    });
    expect(replay.pending).toEqual([]);
  });

  it("commits a claim on another page's route for an account that may commit to that page too", async () => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    await grant(site, await accountId(site, "grace"), "page:wiki/users/ada", "submissions:commits:write");
    const markdown = "---\nslug: ada\n---\nGrace, with Ada's blessing.\n";
    const replay = github(await graceCommit(site, markdown));

    expect(await save(site, { page: GRACE_PAGE, sha: GUIDE_SHA, markdown }, grace)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  it("commits an edit that keeps the page's own route and aliases", async () => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    const markdown = "---\nslug: grace\naliases: [Amazing Grace]\n---\nGrace Hopper wrote the first compiler.\n";
    const replay = github(await graceCommit(site, markdown));

    expect(await save(site, { page: GRACE_PAGE, sha: GUIDE_SHA, markdown }, grace)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  it("sends a new page to review when its slug takes another page's route", async () => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    await grant(site, await accountId(site, "grace"), "page:wiki/people/grace-hopper", "submissions:commits:write");
    const markdown = "---\nslug: ada-lovelace\n---\nGrace.\n";
    const path = "content/People/Grace Hopper.md";
    const replay = github(newPageExchanges({
      path,
      markdown,
      note: NOTE,
      pageUrl: `${ORIGIN}/wiki/`,
      branch: branchFor("content-people-grace-hopper", "new"),
      author: graceAuthor,
      credit: graceCredit,
    }).filter(({ request }) => request.url !== `${API}/issues/42/labels`));

    expect(await save(site, { folder: "People", title: "Grace Hopper", markdown }, grace, "new")).toEqual({
      status: 201,
      body: { kind: "pull-request", url: PULL_42.html_url, number: 42, reason: "route" },
    });
    expect(replay.pending).toEqual([]);
  });
});

describe("user pages", () => {
  const HEAD = "3a1f9c0e5b7d2468ace013579bdf2468ace01357";
  const adaAuthor = { name: "Ada Lovelace", email: "583231+ada@users.noreply.github.com" };
  const adaCredit = "by [Ada Lovelace](<https://github.com/ada>) (signed in with GitHub)";
  /** The guide and the user pages of `handles` in `folder`, which holds a published note only when it holds one of them. */
  const buildWith = (folder: string, handles = ["ada", "grace"]): BuildData => {
    const notes = [published("guide.md", "Guide"), ...handles.map((handle) => published(`${folder}/${handle}.md`, handle))];
    return {
      ...BUILD,
      pages: Object.fromEntries(notes.map(({ href, path }) => [href, `content/${path}`])),
      routes: Object.fromEntries(notes.map(({ slug }) => [slug, holder(slug)])),
      aliases: {},
      folders: handles.length > 0 ? ["", folder] : [""],
      links: notes,
    };
  };
  /** The editor loading the source of `path` at the build commit. */
  const sourceOf = (path: string): Exchange => ({
    request: { method: "GET", url: `${API}/contents/${path}?ref=${BUILD_COMMIT}` },
    response: { status: 200, raw: GUIDE_SOURCE },
  });
  /**
   * `person`'s save of `path` committed straight to the branch, as the account `account` with the handle `handle`: an
   * edit of the guide's source, or a new page where nothing is.
   */
  const committed = (path: string, person: Identity, account: string, { handle = person.handle!, kind = "edit" as "edit" | "new", markdown = MARKDOWN } = {}) => [
    ...commitStart,
    blobExchange(path, HEAD, ...kind === "edit" ? [GUIDE_SHA] : []),
    ...commitExchanges({
      path,
      markdown,
      message: `${kind === "edit" ? "Edit" : "Add"} ${path}\n\n${NOTE}\n\n`
        + `Co-authored-by: ${person.name} <${person.id.split(":")[1]}+${person.handle}@users.noreply.github.com>\nSvartz-Account: ${account}`,
      author: { name: person.name, email: `${handle}@users.noreply.wiki.example` },
    }),
  ];

  it.each([
    ["the default folder", undefined, "users"],
    ["a configured folder", "people", "people"],
  ])("in %s, commits the owner's save of her user page and opens a pull request for anyone else's", async (_, userPages, folder) => {
    const site = await createSite({ userPages, build: buildWith(folder) });
    const grace = await signIn(site, GRACE);
    const ada = await signIn(site, ADA);
    const path = `content/${folder}/grace.md`;
    const replay = github([
      sourceOf(path), sourceOf(path),
      ...committed(path, GRACE, await accountId(site, "grace")),
      ...editExchanges({
        path, markdown: MARKDOWN, note: NOTE, pageUrl: `${ORIGIN}/wiki/${folder}/grace/`, branch: branchFor(`wiki-${folder}-grace`), author: adaAuthor, credit: adaCredit,
      }).filter(({ request }) => request.url !== `${API}/issues/42/labels`),
    ]);
    const page = `/wiki/${folder}/grace/`;
    const destinationOf = async (cookie: string) =>
      (await (await site.request(`${BASE}/source/?page=${encodeURIComponent(page)}`, { cookie })).json() as { destination: unknown }).destination;

    expect([await destinationOf(grace), await destinationOf(ada)]).toEqual(["commit", "pull-request"]);
    expect(await save(site, { page, sha: GUIDE_SHA }, grace)).toEqual({ status: 201, body: commitAnswer });
    expect(await save(site, { page, sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: { kind: "pull-request", url: PULL_42.html_url, number: 42 } });
    expect(replay.pending).toEqual([]);
  });

  it("gives no override in the default folder once another is configured", async () => {
    const site = await createSite({ userPages: "people" });
    const grace = await signIn(site, GRACE);
    github([sourceOf("content/users/grace.md")]);

    expect((await (await site.request(`${BASE}/source/?page=%2Fwiki%2Fusers%2Fgrace%2F`, { cookie: grace })).json() as { destination: unknown }).destination)
      .toBe("pull-request");
  });

  // Proves a page at the user page path of a vault that doesn't run sign-in is an ordinary page: no override on it, and
  // no starting it outside the sections.
  it("treats the user page folder of a vault that holds no user pages as an ordinary folder", async () => {
    const empty = await createSite({ userPageVault: "journal", build: buildWith("users", []) });
    const started = await empty.request(`${BASE}/destination/?folder=users&title=ada`, { cookie: await signIn(empty, ADA) });
    expect([started.status, (await started.json() as { error: unknown }).error]).toEqual([400, "not_a_section"]);

    const withGrace = await createSite({ userPageVault: "journal", build: buildWith("users", ["grace"]) });
    const grace = await signIn(withGrace, GRACE);
    github([sourceOf("content/users/grace.md")]);
    expect((await (await withGrace.request(`${BASE}/source/?page=%2Fwiki%2Fusers%2Fgrace%2F`, { cookie: grace })).json() as { destination: unknown }).destination)
      .toBe("pull-request");
  });

  it("lets an account start its own user page in a folder with no page yet, and nobody else's", async () => {
    const site = await createSite({ build: buildWith("users", []) });
    const ada = await signIn(site, ADA);
    const grace = await signIn(site, GRACE);
    const path = "content/users/ada.md";
    const replay = github(committed(path, ADA, await accountId(site, "ada"), { kind: "new" }));
    const ask = async (title: string, cookie?: string) => {
      const response = await site.request(`${BASE}/destination/?folder=users&title=${title}`, { cookie });
      return response.ok ? (await response.json() as { destination: unknown }).destination : (await response.json() as { error: unknown }).error;
    };

    expect([await ask("ada", ada), await ask("ada", grace), await ask("ada"), await ask("grace", ada)])
      .toEqual(["commit", "not_a_section", "not_a_section", "not_a_section"]);
    expect(await save(site, { folder: "users", title: "grace" }, ada, "new")).toMatchObject({ status: 400, body: { error: "not_a_section" } });
    expect(await save(site, { folder: "users", title: "ada" }, grace, "new")).toMatchObject({ status: 400, body: { error: "not_a_section" } });
    expect(await save(site, { folder: "users", title: " ada " }, ada, "new")).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });

  it("keeps committing its owner's saves of a user page after a handle change", async () => {
    const site = await createSite({ build: buildWith("users") });
    const ada = await signIn(site, ADA);
    const account = await accountId(site, "ada");
    const renamed = await site.request(`${AUTH}/account/profile/`, {
      method: "POST", cookie: ada, body: new URLSearchParams({ name: "Ada Lovelace", handle: "lovelace" }),
    });
    expect(renamed.headers.get("location")).toContain("status=saved");
    // Moving the page to the new handle, with the old address redirecting, claims only addresses that are Ada's.
    const moved = "---\nslug: lovelace\naliases: [users/ada]\n---\n# Ada Lovelace\n";
    const replay = github([
      ...committed("content/users/ada.md", ADA, account, { handle: "lovelace" }),
      repositoryExchange,
      headExchange(),
      ...committed("content/users/ada.md", ADA, account, { handle: "lovelace", markdown: moved }).slice(commitStart.length),
    ]);

    expect(await save(site, { page: "/wiki/users/ada/", sha: GUIDE_SHA }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(await save(site, { page: "/wiki/users/ada/", sha: GUIDE_SHA, markdown: moved }, ada)).toEqual({ status: 201, body: commitAnswer });
    expect(replay.pending).toEqual([]);
  });
});

describe("closing a submission", () => {
  const PANEL = "/wiki/-/dashboard/moderation/reports/?status=closed#report-1";
  const close = (site: Site, cookie: string | undefined, number = "42") =>
    site.request(`${BASE}/close/`, { method: "POST", cookie, body: new URLSearchParams({ number, returnTo: PANEL }) });
  const audited = async ({ db }: Site) => (await db.prepare("SELECT actor_handle, action, target, detail FROM auth_audit").all()).results;
  const HEAD = "4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e";

  /**
   * What Close reads first, as every review action does: pull request #42 as GitHub holds it now, into `base`, named
   * in `fullName`; the default branch; and, into `main`, what it changes and, while open, the guide at its head,
   * which the commit reader reads on a token of its own.
   */
  const inspected = ({ state = "open", base = "main", fullName = REPO } = {}): Exchange[] => [
    {
      request: { method: "GET", url: `${API}/pulls/42` },
      response: {
        status: 200,
        json: {
          ...PULL_42, state, title: "Edit content/guide.md",
          head: { ref: branchFor("wiki-guide"), sha: HEAD, repo: { full_name: fullName } },
          base: { ref: base, sha: BUILD_COMMIT, repo: { full_name: fullName } },
        },
      },
    },
    repositoryExchange,
    ...base === "main"
      ? [
        {
          request: { method: "GET", url: `${API}/compare/${BUILD_COMMIT}...${HEAD}?per_page=1` },
          response: { status: 200, json: { status: "ahead", files: [{ filename: "content/guide.md", status: "modified", patch: "@@ -7 +7 @@\n-Set up the wiki.\n+Set up the wiki in five minutes." }] } },
        },
        ...state === "open"
          ? [
            tokenExchange(new Date(Date.now() + 60 * 60_000).toISOString()),
            { request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${HEAD}` }, response: { status: 200, raw: MARKDOWN } },
          ]
          : [],
      ]
      : [],
  ];

  /** A syncing wiki where Ada, a reader, saved an edit of the guide as pull request #42, and Grace is signed in. */
  async function submitted(options: Parameters<typeof createSite>[0] = {}) {
    const site = await createSite({ sync: true, ...options });
    const ada = await signIn(site, ADA);
    const grace = await signIn(site, GRACE);
    github(adaPullRequest());
    expect(await save(site, { page: "/wiki/guide/" }, ada)).toMatchObject({ status: 201, body: { kind: "pull-request", number: 42 } });
    return { site, ada, grace };
  }

  it("closes a submission saved through this vault for a reviewer, records who did, and goes back", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    // The App's token from the save is still good. No branch is configured, so submissions target the default.
    const replay = replayGitHub([...inspected(), pullExchange(), repositoryExchange, closeExchange], INSTALLATION_TOKEN);

    const answer = await close(site, grace);

    expect(answer.status).toBe(303);
    expect(answer.headers.get("location")).toBe(PANEL);
    expect(replay.pending).toEqual([]);
    expect(await audited(site)).toEqual([{
      actor_handle: "grace", action: "submissions:submission:close", target: "submission:42", detail: JSON.stringify({ repo: REPO, vault: "wiki" }),
    }]);
  });

  // Proves GitHub's case-insensitive names: the repository spelled in another case is still the one submissions target.
  it("closes a submission whose repository GitHub names in another case", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    const replay = replayGitHub([
      ...inspected({ fullName: "WikiPlace/WikiPlace.live" }), pullExchange({ fullName: "WikiPlace/WikiPlace.live" }), repositoryExchange, closeExchange,
    ], INSTALLATION_TOKEN);

    expect((await close(site, grace)).status).toBe(303);
    expect(replay.pending).toEqual([]);
  });

  it("refuses a pull request from another repository", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    replayGitHub([pullExchange({ fullName: "someone/wikiplace.live" })], INSTALLATION_TOKEN);

    expect((await close(site, grace)).status).toBe(404);
    expect(await audited(site)).toEqual([]);
  });

  // Proves review rights stay with their vault: another vault on the same repository can't close this vault's submission.
  it("refuses a submission another vault on the same repository saved, as it refuses one that doesn't exist", async () => {
    const { site, grace } = await submitted();
    const docs = await createSite({ sync: true, vault: "docs", build: { ...BUILD, vaultRoot: "docs" }, db: site.db });
    await grant(site, await accountId(site, "grace"), "vault:docs", "submissions:reviews:write");
    const replay = replayGitHub([], INSTALLATION_TOKEN);

    const theirs = await close(docs, grace);
    const none = await close(docs, grace, "43");

    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toEqual({ error: "not_found", message: `${REPO} has no submission #42.` });
    expect(none.status).toBe(404);
    expect(replay.requests).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  it("refuses every pull request on a vault without sync, which keeps no record of its saves", async () => {
    const site = await createSite({ admins: [ADA.id] });
    const ada = await signIn(site, ADA);
    const replay = github([]);

    expect((await close(site, ada)).status).toBe(404);
    expect(replay.requests).toEqual([]);
  });

  it("leaves a closed submission as it is, recording nothing", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    const replay = replayGitHub([...inspected({ state: "closed" }), pullExchange({ state: "closed" }), repositoryExchange], INSTALLATION_TOKEN);

    expect((await close(site, grace)).status).toBe(303);
    expect(replay.pending).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  it("refuses a pull request whose branch isn't a submission's", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    replayGitHub([pullExchange({ ref: "main" })], INSTALLATION_TOKEN);

    const answer = await close(site, grace);

    expect(answer.status).toBe(404);
    expect(await audited(site)).toEqual([]);
  });

  // Proves a saved submission someone retargeted at another branch is no longer the vault's to close.
  it("refuses a saved submission retargeted at another branch, as it refuses one that doesn't exist", async () => {
    const { site, grace } = await submitted();
    await grant(site, await accountId(site, "grace"), "vault:wiki", "submissions:reviews:write");
    const replay = replayGitHub(inspected({ base: "release" }), INSTALLATION_TOKEN);

    const answer = await close(site, grace);

    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: "not_found", message: `${REPO} has no submission #42.` });
    expect(replay.pending).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  it("refuses an account without the review permission, and a guest, before asking GitHub", async () => {
    const site = await createSite();
    const grace = await signIn(site, GRACE);
    const replay = github([]);

    expect((await close(site, grace)).status).toBe(403);
    expect((await close(site, undefined)).status).toBe(401);
    expect(replay.requests).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });
});

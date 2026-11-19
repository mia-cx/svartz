import { createServer, type PluginPage } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSignIn, suspend } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const OCTOCAT = { id: 583231, login: "octocat", name: "The Octocat" };
const HUBOT = { id: 480938, login: "hubot", name: "Hubot" };
const DAY_MS = 24 * 60 * 60 * 1000;

type D1 = Awaited<ReturnType<Miniflare["getD1Database"]>>;
type D1Statement = ReturnType<D1["prepare"]>;

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/**
 * A fresh D1 as the site gets it, counting its calls in `calls.count` as a Worker invocation's D1 limit does: each
 * query one, and a whole batch one.
 */
async function countingDatabase() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  const db = await miniflare.getD1Database("SVARTZ_DB");
  const calls = { count: 0 };
  const real = new WeakMap<object, D1Statement>();
  const count = <T>(result: T) => (calls.count++, result);
  const statement = (prepared: D1Statement): D1Statement => {
    const wrapped = {
      bind: (...values: unknown[]) => statement(prepared.bind(...values)),
      first: () => count(prepared.first()),
      all: () => count(prepared.all()),
      run: () => count(prepared.run()),
    };
    real.set(wrapped, prepared);
    return wrapped as unknown as D1Statement;
  };
  const database = {
    prepare: (query: string) => statement(db.prepare(query)),
    batch: (statements: D1Statement[]) => count(db.batch(statements.map((each) => real.get(each)!))),
  };
  return { db: database, calls };
}

/** A vault at /notes with auth and a plugin that answers who reads as signed in. Each call starts as a new deployment would. */
function site(db: unknown, { admins = [] as string[] } = {}) {
  const env = { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "gh", SVARTZ_DB: db };
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account"], load: () => import("../src/server"),
        options: { providers: { github: { clientId: "gh-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } }, admins },
        data: { permissions: [] },
      },
      { id: "reader", load: async () => ({ default: () => async (request: Request, context: { env: Record<string, unknown> }) => Response.json(await readSignIn(request, context.env)) }) },
    ],
  }, { privateEnv: env, building: false, dev: false });
  const event = (path: string, init: RequestInit = {}) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  const fetch = (path: string, init?: RequestInit) => server.handle({ event: event(path, init), resolve: async () => new Response("page") });
  return {
    env,
    fetch,
    whoIs: async (cookie: string) => (await fetch("/notes/_svartz/reader/", { headers: { cookie } })).json(),
    accountPage: async (cookie: string) => await server.page(event("/notes/-/account/", { headers: { cookie } })) as PluginPage | undefined,
  };
}
type Site = ReturnType<typeof site>;

/** Sign up with GitHub as `user` through auth's real routes, and answer the session cookie a browser would send back. */
async function signUp(request: Site, user: typeof OCTOCAT): Promise<string> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json(user);
    return new Response(null, { status: 404 });
  });
  const pairs = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
  const start = await request.fetch(`${AUTH}/start/github/?returnTo=%2Fnotes%2F`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request.fetch(`${AUTH}/callback/github/?code=c&state=${state}`, { headers: { cookie: pairs(start).join("; ") } });
  const chosen = await request.fetch(`${AUTH}/handle/`, {
    method: "POST", headers: { cookie: pairs(callback).join("; "), origin: ORIGIN }, body: new URLSearchParams({ handle: user.login }),
  });
  vi.unstubAllGlobals();
  return pairs(chosen).find((pair) => pair.startsWith("__Host-svartz-session="))!;
}

/** Octocat and Hubot signed up; Hubot is the moderator wherever one acts. */
async function twoAccounts(options?: { admins?: string[] }) {
  const { db, calls } = await countingDatabase();
  const request = site(db, options);
  const octocat = await signUp(request, OCTOCAT);
  const hubot = await signUp(request, HUBOT);
  const { account: moderator } = await request.whoIs(hubot);
  return { db, calls, request, octocat, hubot, moderator };
}

describe("a suspended account", () => {
  // Proves enforcement on the next request, the reason the reader gets, the kept session, and expiry by time alone.
  it("reads as signed out with the reason until its time passes, then is signed in again without doing anything", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T12:00:00.000Z") });
    const { request, octocat, moderator } = await twoAccounts();

    expect(await suspend(request.env, moderator, { handle: "octocat", reason: "Vandalised the garden.", until: new Date("2026-11-20T12:00:00.000Z") })).toBe("suspended");

    expect(await request.whoIs(octocat)).toEqual({
      account: null, reason: "suspended", suspension: { reason: "Vandalised the garden.", until: "2026-11-20T12:00:00.000Z", since: "2026-11-19T12:00:00.000Z" },
    });
    vi.setSystemTime(new Date("2026-11-20T12:00:01.000Z"));
    expect((await request.whoIs(octocat)).account).toMatchObject({ handle: "octocat" });
  });

  it("stays suspended for good when the suspension has no end", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T12:00:00.000Z") });
    const { request, octocat, moderator } = await twoAccounts();
    await suspend(request.env, moderator, { handle: "octocat", reason: "Spam." });

    // Just inside the session's 30 days.
    vi.setSystemTime(new Date(Date.now() + 29 * DAY_MS));

    expect(await request.whoIs(octocat)).toMatchObject({ account: null, reason: "suspended", suspension: { reason: "Spam." } });
  });

  // Proves the brief's cost rule: the suspension check joins the session's own batch.
  it("costs a signed-in request no extra D1 call, suspended or not", async () => {
    const { calls, request, octocat, hubot, moderator } = await twoAccounts();
    await request.whoIs(octocat);

    calls.count = 0;
    await request.whoIs(octocat);
    const signedIn = calls.count;
    await suspend(request.env, moderator, { handle: "octocat", reason: "Spam." });
    calls.count = 0;
    await request.whoIs(octocat);
    const suspended = calls.count;
    calls.count = 0;
    await request.whoIs(hubot);

    expect([signedIn, suspended, calls.count]).toEqual([1, 1, 1]);
  });

  it("sees why on its account page, escaped, without the moderator's name, and can sign out from there", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T12:00:00.000Z") });
    const { request, octocat, moderator } = await twoAccounts();
    await suspend(request.env, moderator, { handle: "octocat", reason: "Posted <script>alert(1)</script>.", until: new Date("2026-11-26T09:30:00.000Z") });

    const page = await request.accountPage(octocat);

    expect(page?.html).toContain('Your account is suspended until <time datetime="2026-11-26T09:30:00.000Z">Nov 26, 2026, 9:30 AM UTC</time>');
    expect(page?.html).toContain("Posted &#60;script&#62;alert(1)&#60;/script&#62;.");
    expect(page?.html).not.toContain("hubot");
    const signOut = /<form method="post" action="([^"]+)"><button class="sv-account-button" type="submit">Sign out<\/button>/.exec(page!.html)![1]!;
    const offSite = await request.fetch(`${AUTH}/sign-out/?returnTo=${encodeURIComponent("/a/..//evil.test/")}`, { method: "POST", headers: { cookie: octocat, origin: ORIGIN } });
    expect(offSite.status).toBe(400);
    const signedOut = await request.fetch(signOut.replaceAll("&#38;", "&"), { method: "POST", headers: { cookie: octocat, origin: ORIGIN } });
    expect([signedOut.status, signedOut.headers.get("location")]).toEqual([303, "/notes/-/account/"]);
    vi.setSystemTime(new Date("2026-11-27T00:00:00.000Z"));
    expect(await request.whoIs(octocat)).toEqual({ account: null, reason: "signed-out" });
  });

  it("links to its account page from the site, and nothing else", async () => {
    const { request, octocat, moderator } = await twoAccounts();
    await suspend(request.env, moderator, { handle: "octocat", reason: "Spam." });

    expect(await (await request.fetch(`${AUTH}/viewer/`, { headers: { cookie: octocat } })).json()).toEqual({ suspended: true });
    expect(await (await request.fetch(`${AUTH}/me/`, { headers: { cookie: octocat } })).json()).toBeNull();
  });
});

describe("who can be suspended", () => {
  it("never an admin config names, nor the moderator's own account, and neither writes anything", async () => {
    const { db, request, moderator } = await twoAccounts({ admins: [`github:${OCTOCAT.id}`] });

    expect(await suspend(request.env, moderator, { handle: "octocat", reason: "Spam." })).toBe("admin");
    expect(await suspend(request.env, moderator, { handle: "hubot", reason: "Spam." })).toBe("self");
    expect(await suspend(request.env, moderator, { handle: "nobody", reason: "Spam." })).toBe("not-found");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM auth_suspensions").all()).results).toEqual([{ n: 0 }]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM auth_audit").all()).results).toEqual([{ n: 0 }]);
  });

  // Proves the break-glass: config's admins stay reachable even when config named them after their suspension.
  it("leaves an account config names an admin signed in, even when it was suspended before", async () => {
    const { db, request, octocat, moderator } = await twoAccounts();
    await suspend(request.env, moderator, { handle: "octocat", reason: "Spam." });

    const redeployed = site(db, { admins: [`github:${OCTOCAT.id}`] });

    expect((await redeployed.whoIs(octocat)).account).toMatchObject({ handle: "octocat", roles: ["admin"] });
  });
});

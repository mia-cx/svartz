import { createServerHandle, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seal } from "../src/seal";
import { readIdentity, readSignIn } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const OCTOCAT = { id: 583231, login: "octocat", name: "The Octocat", avatar_url: "https://avatars.githubusercontent.com/u/583231", html_url: "https://github.com/octocat" };
const OCTOCAT_IDENTITY = {
  id: "github:583231",
  provider: "github",
  name: "The Octocat",
  handle: "octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231",
  profileUrl: "https://github.com/octocat",
} as const;

type GitHubUser = { id: number; login: string; name?: string; avatar_url?: string; html_url?: string };
interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> }; run(): Promise<unknown> };
}

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/** A fresh, empty D1 database from Miniflare, as the site binds it. */
async function createDatabase(): Promise<Database> {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  return await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
}

/**
 * A vault at /notes with the auth plugin and a plugin that reports who reads as signed in. `db` is bound as
 * `SVARTZ_DB` unless it is `undefined`. Each call is a fresh router, as a new isolate would start.
 */
function site(db: Database | undefined, { admins = [] as string[] } = {}) {
  const reader = (): ServerHandler => async (request, context) => Response.json({
    signIn: await readSignIn(request, context.env),
    identity: await readIdentity(request, context.env),
  });
  const env = { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", ...db && { SVARTZ_DB: db } };
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth",
        // As the `auth` plugin registers it.
        eager: true,
        load: () => import("../src/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } }, admins },
      },
      { id: "reader", load: async () => ({ default: reader }) },
    ],
  }, { privateEnv: env, building: false, dev: false });
  return (path: string, { cookies = [] as string[], method = "GET", body }: { cookies?: string[]; method?: string; body?: URLSearchParams } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (method === "POST") headers.set("origin", ORIGIN);
    const request = new Request(`${ORIGIN}${path}`, { method, headers, body });
    return handle({ event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" }, resolve: async () => new Response("page") });
  };
}
type Site = ReturnType<typeof site>;

/** `name=value` pairs a browser would send back, from a response's Set-Cookie headers, without cleared ones. */
const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub as `user` from /notes/garden/, through the real start and callback routes, in a fresh browser. */
async function signInWithGitHub(request: Site, user: GitHubUser = OCTOCAT): Promise<Response> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json(user);
    return new Response(null, { status: 404 });
  });
  const start = await request(`${AUTH}/start/github/?returnTo=${encodeURIComponent("/notes/garden/")}`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  return request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: cookiesFrom(start) });
}

/** Choose `handle` on the chooser a first sign-in landed on. */
const chooseHandle = (request: Site, callback: Response, handle: string) =>
  request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle }) });

/** Sign in for the first time as `user`, choosing `handle`, and answer the session cookie. */
async function createAccount(request: Site, user: GitHubUser, handle: string): Promise<string[]> {
  const chosen = await chooseHandle(request, await signInWithGitHub(request, user), handle);
  expect(chosen.status).toBe(303);
  return cookiesFrom(chosen);
}

const whoIs = async (request: Site, cookies: string[]) => (await request("/notes/_svartz/reader/", { cookies })).json();

describe("signing in with accounts", () => {
  it("asks a first-time reader for a handle, prefilled from the provider, then signs them in to a new account", async () => {
    const request = site(await createDatabase());

    const callback = await signInWithGitHub(request);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(`${AUTH}/handle/`);
    expect(cookiesFrom(callback).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);

    const chooser = await request(`${AUTH}/handle/`, { cookies: cookiesFrom(callback) });
    expect(chooser.status).toBe(200);
    expect(await chooser.text()).toContain('value="octocat"');

    const chosen = await chooseHandle(request, callback, "octocat");
    expect(chosen.status).toBe(303);
    expect(chosen.headers.get("location")).toBe("/notes/garden/");
    expect(await whoIs(request, cookiesFrom(chosen))).toEqual({
      signIn: {
        account: { id: expect.any(String), handle: "octocat", name: "The Octocat", avatarUrl: OCTOCAT.avatar_url, createdAt: expect.any(String), roles: [], identity: OCTOCAT_IDENTITY },
      },
      identity: OCTOCAT_IDENTITY,
    });
  });

  it("signs a returning reader straight in to the account their provider account is linked to", async () => {
    const request = site(await createDatabase());
    const first = await whoIs(request, await createAccount(request, OCTOCAT, "octocat"));

    const again = await signInWithGitHub(request, { ...OCTOCAT, name: "Mona" });

    expect(again.headers.get("location")).toBe("/notes/garden/");
    const second = await whoIs(request, cookiesFrom(again));
    expect(second.signIn.account.id).toBe(first.signIn.account.id);
    // The provider's profile is refreshed; the account keeps the name it was created with.
    expect(second.identity.name).toBe("Mona");
    expect(second.signIn.account.name).toBe("The Octocat");
  });

  it("refuses a handle someone has, or one that isn't a handle, and offers the closest free one", async () => {
    const request = site(await createDatabase());
    await createAccount(request, OCTOCAT, "octocat");
    const callback = await signInWithGitHub(request, { id: 1, login: "OctoCat" });

    expect(await (await request(`${AUTH}/handle/`, { cookies: cookiesFrom(callback) })).text()).toContain('value="octocat-2"');

    const taken = await chooseHandle(request, callback, "octocat");
    expect(taken.status).toBe(422);
    expect(await taken.text()).toContain("@octocat is taken. @octocat-2 is free");
    const invalid = await chooseHandle(request, callback, "-octo cat-");
    expect(invalid.status).toBe(422);
    expect(await invalid.text()).toContain("starting and ending with a letter or number");

    const chosen = await chooseHandle(request, callback, "@Octo_Cat");
    expect(chosen.status).toBe(303);
    expect((await whoIs(request, cookiesFrom(chosen))).signIn.account.handle).toBe("octo_cat");
  });
});

describe("sessions", () => {
  it("signs a browser out on its next request once its session is deleted from D1", async () => {
    const db = await createDatabase();
    const request = site(db);
    const session = await createAccount(request, OCTOCAT, "octocat");

    await db.prepare("DELETE FROM auth_sessions").run();

    expect(await whoIs(request, session)).toEqual({ signIn: { account: null, reason: "signed-out" }, identity: null });
    expect(await (await request(`${AUTH}/me/`, { cookies: session })).json()).toBeNull();
  });

  it("ends the session on sign-out, so a copy of the cookie reads as signed out too", async () => {
    const request = site(await createDatabase());
    const session = await createAccount(request, OCTOCAT, "octocat");

    expect((await request(`${AUTH}/sign-out/`, { method: "POST", cookies: session })).status).toBe(204);

    expect((await whoIs(request, session)).signIn).toEqual({ account: null, reason: "signed-out" });
  });
});

describe("a cookie from before accounts", () => {
  const legacyCookie = async () => [`__Host-svartz-session=${await seal(OCTOCAT_IDENTITY, SECRET, "session", 30 * 24 * 60 * 60)}`];

  it("becomes one account and one session on its first read, so nobody is signed out", async () => {
    const db = await createDatabase();
    const request = site(db);
    const cookie = await legacyCookie();

    const [first, racing] = await Promise.all([whoIs(request, cookie), whoIs(request, cookie)]);
    const later = await whoIs(request, cookie);

    expect(first.signIn.account).toMatchObject({ handle: "octocat", identity: OCTOCAT_IDENTITY });
    expect(first.identity).toEqual(OCTOCAT_IDENTITY);
    expect(racing.signIn.account.id).toBe(first.signIn.account.id);
    expect(later.signIn.account.id).toBe(first.signIn.account.id);
    expect((await db.prepare("SELECT id FROM auth_sessions").bind().all()).results).toHaveLength(1);
    // Signing in with the same provider account later reaches the same account.
    expect((await whoIs(request, cookiesFrom(await signInWithGitHub(request)))).signIn.account.id).toBe(first.signIn.account.id);
  });

  it("never becomes a session again once its session is deleted", async () => {
    const db = await createDatabase();
    const request = site(db);
    const cookie = await legacyCookie();
    await whoIs(request, cookie);

    await db.prepare("DELETE FROM auth_sessions").run();

    expect(await whoIs(request, cookie)).toEqual({ signIn: { account: null, reason: "signed-out" }, identity: null });
  });

  it("stays signed out when the same cookie is sent in another base64 spelling", async () => {
    const db = await createDatabase();
    const request = site(db);
    const [cookie] = await legacyCookie();
    await whoIs(request, [cookie!]);
    await db.prepare("DELETE FROM auth_sessions").run();

    // base64 decoding skips whitespace, so this opens to the same sealed bytes.
    const respelled = `${cookie!.slice(0, -4)} ${cookie!.slice(-4)}`;

    expect((await whoIs(request, [respelled])).signIn).toEqual({ account: null, reason: "signed-out" });
  });
});

describe("bootstrap admins", () => {
  it("hold the admin role, which no change to the database takes away", async () => {
    const db = await createDatabase();
    const request = site(db, { admins: ["github:583231"] });
    const admin = await createAccount(request, OCTOCAT, "octocat");
    const reader = await createAccount(request, { id: 1, login: "hubot" }, "hubot");

    await db.prepare("DELETE FROM auth_settings").run();

    expect((await whoIs(request, admin)).signIn.account.roles).toEqual(["admin"]);
    expect((await whoIs(request, reader)).signIn.account.roles).toEqual([]);
  });

  it("lose the role on the next deployment's first request, even when another plugin answers it", async () => {
    const db = await createDatabase();
    const admin = await createAccount(site(db, { admins: ["github:583231"] }), OCTOCAT, "octocat");

    // The deployment that removed the admin: its first request goes to the reader plugin, not to an auth route.
    const redeployed = site(db, { admins: [] });

    expect((await whoIs(redeployed, admin)).signIn.account.roles).toEqual([]);
  });
});

describe("without an accounts database", () => {
  it("keeps signing readers in by identity alone, and says why there is no account", async () => {
    const request = site(undefined);

    const callback = await signInWithGitHub(request);

    expect(callback.headers.get("location")).toBe("/notes/garden/");
    expect(await whoIs(request, cookiesFrom(callback))).toEqual({ signIn: { account: null, reason: "no-database" }, identity: OCTOCAT_IDENTITY });
  });
});

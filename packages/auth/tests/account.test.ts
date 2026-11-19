import { createServer, type PluginPage } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seal } from "../src/seal";
import { readSignIn } from "../src/server";
import { sealSession } from "../src/session";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const ACCOUNT_PAGE = "/notes/-/account/";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";

type User = { provider: "github" | "discord"; id: string; login: string; name?: string };
const OCTOCAT: User = { provider: "github", id: "583231", login: "octocat", name: "The Octocat" };
const HUBOT: User = { provider: "github", id: "480938", login: "hubot", name: "Hubot" };
const NELLY: User = { provider: "discord", id: "80351110224678912", login: "nelly", name: "Nelly" };

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> }; run(): Promise<unknown> };
}

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function createDatabase(): Promise<Database> {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  return await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
}

/**
 * A vault at /notes with auth offering GitHub and Discord, and a plugin that reports who reads as signed in. `userPages`
 * is what the build found in the user page folder, by handle.
 */
function site(db: Database | undefined, userPages: Record<string, string | null> = {}) {
  const env = { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "gh", PRIVATE_DISCORD_SECRET: "dc", ...db && { SVARTZ_DB: db } };
  const providers = {
    github: { clientId: "gh-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } },
    discord: { clientId: "dc-id", clientSecret: { env: "PRIVATE_DISCORD_SECRET" } },
  };
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      { id: "auth", eager: true, pages: ["account"], load: () => import("../src/server"), options: { providers }, data: { permissions: [], userPages } },
      { id: "reader", load: async () => ({ default: () => async (request: Request, context: { env: Record<string, unknown> }) => Response.json(await readSignIn(request, context.env)) }) },
    ],
  }, { privateEnv: env, building: false, dev: false });
  const event = (path: string, init: RequestInit) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  const request = (path: string, { cookies = [] as string[], method = "GET", body, origin = method === "POST" ? ORIGIN : undefined }: { cookies?: string[]; method?: string; body?: URLSearchParams; origin?: string } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (origin) headers.set("origin", origin);
    return server.handle({ event: event(path, { method, headers, body }), resolve: async () => new Response("page") });
  };
  const page = async (cookies: string[], query = ""): Promise<PluginPage | undefined> => {
    const result = await server.page(event(`${ACCOUNT_PAGE}${query}`, { headers: { cookie: cookies.join("; ") } }));
    if (result && "redirect" in result) throw new Error("unexpected redirect");
    return result;
  };
  return { request, page };
}
type Site = ReturnType<typeof site>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
const sessionOf = (cookies: string[]) => cookies.filter((pair) => pair.startsWith("__Host-svartz-session="));

/** Answer GitHub's and Discord's token and profile endpoints as `user`. */
function provider(user: User) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/access_token") || url.endsWith("/oauth2/token")) return Response.json({ access_token: "token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id: Number(user.id), login: user.login, name: user.name });
    if (url === "https://discord.com/api/v10/users/@me") return Response.json({ id: user.id, username: user.login, global_name: user.name });
    return new Response(null, { status: 404 });
  });
}

/** Finish an OAuth round trip `start` began, as `user`, sending `cookies` along. */
async function callback(request: Site["request"], start: Response, user: User, cookies: string[] = []) {
  provider(user);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  return request(`${AUTH}/callback/${user.provider}/?code=issued&state=${state}`, { cookies: [...cookies, ...cookiesFrom(start)] });
}

/** Sign up as `user` with `handle` in a fresh browser, and answer its session cookie. */
async function signUp(request: Site["request"], user: User, handle: string): Promise<string[]> {
  const back = await callback(request, await request(`${AUTH}/start/${user.provider}/?returnTo=/notes/`), user);
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(back), body: new URLSearchParams({ handle }) });
  return sessionOf(cookiesFrom(chosen));
}

/** Sign in as `user`, already linked, in a fresh browser. */
async function signIn(request: Site["request"], user: User): Promise<string[]> {
  return sessionOf(cookiesFrom(await callback(request, await request(`${AUTH}/start/${user.provider}/?returnTo=/notes/`), user)));
}

/** Link `user` to the account signed in with `session`, and answer where the callback sent the reader. */
async function link(request: Site["request"], session: string[], user: User): Promise<string | null> {
  const start = await request(`${AUTH}/account/link/${user.provider}/?returnTo=${encodeURIComponent(ACCOUNT_PAGE)}`, { method: "POST", cookies: session });
  expect(start.status).toBe(303);
  return (await callback(request, start, user, session)).headers.get("location");
}

const reader = async (request: Site["request"], cookies: string[]) => (await (await request("/notes/_svartz/reader/", { cookies })).json()).account;
const post = (request: Site["request"], route: string, session: string[], form: Record<string, string> = {}, origin?: string) =>
  request(`${AUTH}/account/${route}/`, { method: "POST", cookies: session, body: new URLSearchParams(form), ...origin !== undefined && { origin } });
const text = (page: PluginPage | undefined) => page?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") ?? "";

describe("/-/account/", () => {
  // Proves a signed-out reader is offered every provider, each returning to the account page, and that the page needs accounts.
  it("asks a signed-out reader to sign in, and doesn't exist without accounts", async () => {
    const page = await site(await createDatabase()).page([]);

    expect(page?.title).toBe("Account");
    expect(page?.html).toContain(`href="${AUTH}/start/github/?returnTo=${encodeURIComponent(ACCOUNT_PAGE)}"`);
    expect(page?.html).toContain(`href="${AUTH}/start/discord/?returnTo=${encodeURIComponent(ACCOUNT_PAGE)}"`);
    expect(await site(undefined).page([])).toBeUndefined();
  });

  // Proves story 3: linking a second provider reaches the same account from then on.
  it("links another provider, which then signs in to the same account", async () => {
    const { request, page } = site(await createDatabase());
    const session = await signUp(request, OCTOCAT, "octocat");

    expect(await link(request, session, NELLY)).toBe(`${ACCOUNT_PAGE}?status=linked&provider=discord`);

    const viaDiscord = await signIn(request, NELLY);
    expect((await reader(request, viaDiscord)).id).toBe((await reader(request, session)).id);
    expect(text(await page(session, "?status=linked&provider=discord"))).toContain("Discord is linked.");
    expect(text(await page(session))).toMatch(/GitHub @octocat Current sign-in .*Discord @nelly Unlink/);
  });

  // Proves a provider account belongs to one person: linking one another account has changes nothing.
  it("refuses to link a provider account that another account has", async () => {
    const { request } = site(await createDatabase());
    const octocat = await signUp(request, OCTOCAT, "octocat");
    const hubot = await signUp(request, HUBOT, "hubot");

    expect(await link(request, hubot, OCTOCAT)).toBe(`${ACCOUNT_PAGE}?status=linked-elsewhere&provider=github`);

    expect((await reader(request, await signIn(request, OCTOCAT))).id).toBe((await reader(request, octocat)).id);
  });

  // Proves a link lands only on the session that asked for it: one signed out meanwhile, or another browser, gets nothing.
  it("links only to the session that started the link", async () => {
    const { request } = site(await createDatabase());
    const octocat = await signUp(request, OCTOCAT, "octocat");
    const hubot = await signUp(request, HUBOT, "hubot");
    const start = await request(`${AUTH}/account/link/discord/?returnTo=${encodeURIComponent(ACCOUNT_PAGE)}`, { method: "POST", cookies: octocat });

    // The flow cookie carried into hubot's browser, as a forged or replayed callback would.
    const elsewhere = await callback(request, start, NELLY, hubot);
    expect(elsewhere.headers.get("location")).toBe(`${ACCOUNT_PAGE}?status=link-expired`);
    expect((await request(`${AUTH}/sign-out/`, { method: "POST", cookies: octocat })).status).toBe(204);
    const signedOut = await callback(request, start, NELLY, octocat);
    expect(signedOut.headers.get("location")).toBe(`${ACCOUNT_PAGE}?status=link-expired`);

    // Nobody has Discord, so signing in with it asks for a handle.
    const fresh = await callback(request, await request(`${AUTH}/start/discord/`), NELLY);
    expect(fresh.headers.get("location")).toBe(`${AUTH}/handle/`);
  });

  // Proves account changes come only from this site's pages: a cross-site or origin-less form changes nothing.
  it("refuses account changes from another origin, or without one", async () => {
    const { request } = site(await createDatabase());
    const session = await signUp(request, OCTOCAT, "octocat");

    for (const origin of ["https://evil.test", ""]) {
      expect((await post(request, "profile", session, { name: "Pwned", handle: "pwned" }, origin)).status).toBe(403);
      expect((await post(request, "sign-out-everywhere", session, {}, origin)).status).toBe(403);
      expect((await request(`${AUTH}/account/link/discord/`, { method: "POST", cookies: session, origin })).status).toBe(403);
    }

    expect(await reader(request, session)).toMatchObject({ handle: "octocat", name: "The Octocat" });
  });

  // Proves story 4: a provider unlinks while another remains, this browser's own never, and racing unlinks keep one.
  it("unlinks a provider while one remains, and never the last", async () => {
    const { request, page } = site(await createDatabase());
    const github = await signUp(request, OCTOCAT, "octocat");
    await link(request, github, NELLY);
    const discord = await signIn(request, NELLY);

    const own = await post(request, "unlink", github, { identity: "github:583231" });
    expect(own.headers.get("location")).toBe(`${ACCOUNT_PAGE}?status=unlink-current&provider=github`);

    // Each browser unlinks the other's provider at once: one wins, and the account keeps a way in.
    const [first, second] = await Promise.all([
      post(request, "unlink", github, { identity: `discord:${NELLY.id}` }),
      post(request, "unlink", discord, { identity: "github:583231" }),
    ]);
    const outcomes = [first, second].map((response) => new URL(response.headers.get("location")!, ORIGIN).searchParams.get("status"));
    expect([...outcomes].sort()).toEqual(["unlink-last", "unlinked"]);
    const [survivor, ended] = outcomes[0] === "unlinked" ? [github, discord] : [discord, github];
    const remaining = text(await page(survivor));
    expect(remaining.match(/Current sign-in/g)).toHaveLength(1);
    expect(remaining).not.toContain("Unlink");
    // The unlinked provider's sessions ended with it.
    expect(await reader(request, ended)).toBeNull();
  });

  // Proves story 5: the page lists each live session, marks this browser's, and sign out everywhere ends every one.
  it("lists sessions and signs out everywhere", async () => {
    const { request, page } = site(await createDatabase());
    const laptop = await signUp(request, OCTOCAT, "octocat");
    const phone = await signIn(request, OCTOCAT);

    const sessions = text(await page(laptop)).split("Sessions")[1]!;
    expect(sessions.match(/GitHub Signed in/g)).toHaveLength(2);
    expect(sessions.match(/This browser/g)).toHaveLength(1);

    const out = await post(request, "sign-out-everywhere", laptop);
    expect([out.status, out.headers.get("location")]).toEqual([303, ACCOUNT_PAGE]);
    expect(out.headers.getSetCookie().some((header) => header.startsWith("__Host-svartz-session=;"))).toBe(true);
    expect(await reader(request, laptop)).toBeNull();
    expect(await reader(request, phone)).toBeNull();
    expect(text(await page(phone))).toContain("Sign in to manage your account.");
  });

  // Proves story 6: name and handle change together, the old handle redirects to the new one for good, and nobody else
  // can take it.
  it("changes the display name and handle, keeping the old handle pointing here", async () => {
    const { request, page } = site(await createDatabase());
    const session = await signUp(request, OCTOCAT, "octocat");

    const saved = await post(request, "profile", session, { name: " Mona Lisa Octocat ", handle: "@Mona" });
    expect(saved.headers.get("location")).toBe(`${ACCOUNT_PAGE}?status=saved`);
    expect(await reader(request, session)).toMatchObject({ handle: "mona", name: "Mona Lisa Octocat" });
    expect(text(await page(session, "?status=saved"))).toContain("Profile saved.");

    const old = await request(`${AUTH}/users/octocat/`);
    expect([old.status, old.headers.get("location")]).toEqual([308, `${AUTH}/users/mona/`]);
    expect(await (await request(`${AUTH}/users/mona/`)).json()).toMatchObject({ handle: "mona", name: "Mona Lisa Octocat" });
    expect((await request(`${AUTH}/users/nobody/`)).status).toBe(404);

    // The old handle stays this account's: someone else can't take it, but its owner can switch back.
    const hubot = await signUp(request, HUBOT, "hubot");
    const taken = await post(request, "profile", hubot, { name: "Hubot", handle: "octocat" });
    expect(taken.headers.get("location")).toBe(`${ACCOUNT_PAGE}?status=handle-taken&name=Hubot&handle=octocat`);
    const namesake = await callback(request, await request(`${AUTH}/start/discord/`), { ...NELLY, login: "octocat" });
    expect(await (await request(`${AUTH}/handle/`, { cookies: cookiesFrom(namesake) })).text()).toContain('value="octocat-2"');
    expect((await post(request, "profile", session, { name: "The Octocat", handle: "octocat" })).headers.get("location")).toContain("status=saved");
    expect((await request(`${AUTH}/users/mona/`)).headers.get("location")).toBe(`${AUTH}/users/octocat/`);
  });

  // Proves the entry point: a link to the account's user page, or, while it has none, the empty region a plugin that
  // can create pages fills with the action that starts one.
  it("links the account's user page, or leaves room for a plugin to start it", async () => {
    const db = await createDatabase();
    const before = site(db);
    const ada = await signUp(before.request, OCTOCAT, "ada");
    const grace = await signUp(before.request, HUBOT, "grace");

    const region = (await before.page(ada))?.html;
    expect(region).toContain('<div class="sv-account-page" data-svartz-region="user-page-actions" data-svartz-user-page="users/ada"></div>');
    expect(region).not.toContain("Your page");

    // The next build has Ada's page, and a hidden one for Grace, which the site never links.
    const after = site(db, { ada: "/notes/users/ada/", grace: null });
    const linked = (await after.page(ada))?.html;
    expect(linked).toContain('<a class="sv-account-button sv-account-page" href="/notes/users/ada/">Your page</a>');
    expect(linked).not.toContain("user-page-actions");
    expect((await after.page(grace))?.html).not.toMatch(/Your page|user-page-actions/);
  });

  // Proves the page stays reachable through a handle change: it stays where it was written, and stays its owner's.
  it("keeps linking the user page under the old handle after a handle change", async () => {
    // Handles differ from the other tests': a user page the build found keeps its handle taken for the whole process.
    const db = await createDatabase();
    const hopper = await signUp(site(db).request, OCTOCAT, "hopper");
    const { request, page } = site(db, { hopper: "/notes/users/hopper/" });

    expect((await post(request, "profile", hopper, { name: "Grace", handle: "grace-hopper" })).headers.get("location")).toContain("status=saved");
    expect((await page(hopper))?.html).toContain('href="/notes/users/hopper/">Your page</a>');
    // Its owner may switch back to the handle its page carries.
    expect((await post(request, "profile", hopper, { name: "Grace", handle: "hopper" })).headers.get("location")).toContain("status=saved");
  });

  // Proves no account gains a page someone else wrote by taking the handle it carries, when no account ever held it.
  it("treats a handle whose user page exists as taken", async () => {
    const { request } = site(await createDatabase(), { babbage: "/notes/users/babbage/" });

    const back = await callback(request, await request(`${AUTH}/start/github/?returnTo=/notes/`), { ...OCTOCAT, login: "babbage" });
    const chooser = await request(`${AUTH}/handle/`, { cookies: cookiesFrom(back) });
    expect(await chooser.text()).toContain('value="babbage-2"');
    const refused = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(back), body: new URLSearchParams({ handle: "babbage" }) });
    expect([refused.status, await refused.text()]).toEqual([422, expect.stringContaining("@babbage is taken")]);

    const hubot = await signUp(request, HUBOT, "hubot");
    const taken = await post(request, "profile", hubot, { name: "Hubot", handle: "babbage" });
    expect(taken.headers.get("location")).toContain("status=handle-taken");
    expect(await reader(request, hubot)).toMatchObject({ handle: "hubot" });
  });

  // Proves a refused profile change keeps what the reader typed and says what to fix, changing nothing.
  it("refuses a malformed handle or name, keeping what was typed", async () => {
    const { request, page } = site(await createDatabase());
    const session = await signUp(request, OCTOCAT, "octocat");

    const handle = await post(request, "profile", session, { name: "Mona", handle: "-mona lisa-" });
    expect(handle.headers.get("location")).toContain("status=handle-invalid");
    const name = await post(request, "profile", session, { name: "  ", handle: "mona" });
    expect(name.headers.get("location")).toContain("status=name-invalid");

    const shown = await page(session, new URL(handle.headers.get("location")!, ORIGIN).search);
    expect(shown?.html).toContain('value="-mona lisa-"');
    expect(shown?.html).toContain('role="alert"');
    expect(await reader(request, session)).toMatchObject({ handle: "octocat", name: "The Octocat" });
  });

  // Proves sign out everywhere also ends the browsers still holding a cookie from before accounts: one already read
  // ends with the other sessions, and one never read before can't become a new session for the account afterwards.
  it("signs out cookies from before accounts everywhere, read or not", async () => {
    const { request } = site(await createDatabase());
    const laptop = await signUp(request, OCTOCAT, "octocat");
    const legacy = async () => [`__Host-svartz-session=${await seal(
      { id: `github:${OCTOCAT.id}`, provider: "github", name: "The Octocat", handle: "octocat" }, SECRET, "session", 30 * 24 * 60 * 60)}`];
    const read = await legacy();
    const unread = await legacy();
    expect(await reader(request, read)).toMatchObject({ handle: "octocat" });

    await post(request, "sign-out-everywhere", laptop);

    expect(await reader(request, read)).toBeNull();
    expect(await reader(request, unread)).toBeNull();
    expect(await reader(request, unread)).toBeNull();
    // Signing in again still works.
    expect(await reader(request, await signIn(request, OCTOCAT))).toMatchObject({ handle: "octocat" });
  });

  // Proves an unread cookie from before accounts stays signed out after sign out everywhere, wherever its provider
  // account goes next: unlinked from the account and linked to another, it still never becomes a session.
  it("keeps an unread cookie from before accounts signed out after its provider account moves", async () => {
    const { request } = site(await createDatabase());
    const github = await signUp(request, OCTOCAT, "octocat");
    await link(request, github, NELLY);
    const unread = [`__Host-svartz-session=${await seal(
      { id: `discord:${NELLY.id}`, provider: "discord", name: "Nelly", handle: "nelly" }, SECRET, "session", 30 * 24 * 60 * 60)}`];

    await post(request, "sign-out-everywhere", github);
    const again = await signIn(request, OCTOCAT);
    await post(request, "unlink", again, { identity: `discord:${NELLY.id}` });
    const hubot = await signUp(request, HUBOT, "hubot");
    await link(request, hubot, NELLY);

    expect(await reader(request, unread)).toBeNull();
    // Signing in with that Discord account still works, on the account that holds it now.
    expect(await reader(request, await signIn(request, NELLY))).toMatchObject({ handle: "hubot" });
  });

  // Proves a session reads only while its provider account is still linked to its account. A sign-in with Discord looks
  // up Discord's account, then inserts a session for it. When the account unlinks Discord and Discord joins another
  // account in between, that session lands on the first account, which unlinked Discord to keep it out.
  it("never revives a session whose provider account left its account", async () => {
    const db = await createDatabase();
    const { request } = site(db);
    const github = await signUp(request, OCTOCAT, "octocat");
    await link(request, github, NELLY);
    const { id: account } = await reader(request, github);
    await post(request, "unlink", github, { identity: `discord:${NELLY.id}` });
    const nelly = await signUp(request, NELLY, "nelly");

    // The session the racing sign-in inserts last: the first account's, signed in with a Discord account now Nelly's.
    const stale = "stale-session-id";
    await db.prepare("INSERT INTO auth_sessions (id, account_id, identity_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(stale, account, `discord:${NELLY.id}`, new Date().toISOString(), Date.now() + 60_000).all();

    expect(await reader(request, [`__Host-svartz-session=${await sealSession(stale, SECRET)}`])).toBeNull();
    expect(await reader(request, github)).toMatchObject({ id: account });
    expect(await reader(request, nelly)).toMatchObject({ handle: "nelly" });
  });
});

/**
 * Groups through auth's real routes and pages on a real D1: creating one, inviting, accepting, promoting and removing,
 * a moderator linking one, and what `can()` answers afterwards.
 */
import { createServer, type PermissionDeclaration, type PluginPage, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { can, readAccount } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const ACCOUNT = "/notes/-/account/";
const PANEL = "/notes/-/dashboard/auth/groups/";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const ADMIN = 1;
const DELETE = "guestbook:entries:delete";

const PERMISSIONS: PermissionDeclaration[] = [{ slug: DELETE, name: "Delete any entry", description: "Remove anyone's entry." }];

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> } };
}

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/**
 * A vault at /notes with auth (GitHub user 1 is the admin) on a fresh D1, and a `probe` plugin answering
 * `can(reader, guestbook:entries:delete, { vault: "notes", page: ?page })`.
 */
async function createSite({ vaults = ["notes"] } = {}) {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  const db = await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
  const probe = (): ServerHandler => async (request, context) =>
    Response.json(await can(await readAccount(request, context.env), DELETE, { vault: "notes", page: new URL(request.url).searchParams.get("page")! }, context.env));
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard", "groups"], load: () => import("../src/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins: [`github:${ADMIN}`], permissions: PERMISSIONS, vaults,
        },
        data: { permissions: [], paths: [] },
      },
      { id: "probe", load: async () => ({ default: probe }) },
    ],
  }, { privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", SVARTZ_DB: db }, building: false, dev: false });
  const event = (path: string, init: RequestInit) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  const request = (path: string, { cookies = [] as string[], method = "GET", body, origin = method === "POST" ? ORIGIN : undefined }: { cookies?: string[]; method?: string; body?: URLSearchParams; origin?: string } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (origin) headers.set("origin", origin);
    return server.handle({ event: event(path, { method, headers, body }), resolve: async () => new Response("page") });
  };
  /** The page at `path` as `cookies` see it, or `undefined` for the 404. */
  const page = async (path: string, cookies: string[]): Promise<PluginPage | undefined> => {
    const result = await server.page(event(path, { headers: { cookie: cookies.join("; ") } }));
    if (result && "redirect" in result) throw new Error("unexpected redirect");
    return result;
  };
  /** POST `form` to `groups/<route>`, answering the response. */
  const post = (route: string, cookies: string[], form: Record<string, string> = {}, origin?: string) =>
    request(`${AUTH}/groups/${route}`, { method: "POST", cookies, body: new URLSearchParams(form), ...origin !== undefined && { origin } });
  const mayDelete = async (cookies: string[], page: string) =>
    (await request(`/notes/_svartz/probe/?${new URLSearchParams({ page })}`, { cookies })).json();
  return { db, request, page, post, mayDelete };
}
type Site = Awaited<ReturnType<typeof createSite>>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub for the first time as user `id`, named `name`, choosing `handle`; answer the session cookie. */
async function signUp({ request }: Site, id: number, handle: string, name = handle): Promise<string[]> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id, login: handle, name });
    return new Response(null, { status: 404 });
  });
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: cookiesFrom(start) });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle }) });
  vi.unstubAllGlobals();
  return cookiesFrom(chosen);
}

/** What a reader sees of a page: its text, with entities as their characters. */
const text = (page: PluginPage | undefined) => (page?.html ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();
/** Where a form's redirect goes, as path, query and fragment. */
const location = async (response: Promise<Response>) => (await response).headers.get("location");
const auditLog = async (db: Database) => (await db.prepare("SELECT actor_handle, action, target, detail FROM auth_audit ORDER BY id").bind().all()).results
  .map((row) => `${row.actor_handle} ${row.action} ${row.target} ${row.detail}`);

/** `owner` creates group `rosarians` and brings `members` in: invited, then accepting. */
async function rosarians(site: Site, owner: string[], members: Array<[handle: string, cookies: string[]]>) {
  await site.post("", owner, { name: "rosarians", "display-name": "The Rosarians" });
  for (const [handle, cookies] of members) {
    await site.post("rosarians/invite/", owner, { handle });
    await site.post("rosarians/accept/", cookies);
  }
}

describe("a group's members", () => {
  // Proves stories 18 and 19: anyone signed in creates a group and owns it; owners invite, the invited join only by
  // accepting, and owners make co-owners and remove members. Every step is on the account page or the group's page,
  // and in the audit log.
  it("are created, invited, accepted, promoted and removed by the group's own owners", async () => {
    const site = await createSite();
    const ada = await signUp(site, 2, "ada");
    const bob = await signUp(site, 3, "bob");
    const cy = await signUp(site, 4, "cy");

    expect(await location(site.post("", ada, { name: "Rosarians", "display-name": "The Rosarians" })))
      .toBe("/notes/-/groups/rosarians/?status=group-created#sv-group-members");
    expect(text(await site.page("/notes/-/groups/rosarians/?status=group-created", ada)))
      .toBe("Account The Rosarians rosarians · You own this group Members Group created. Invite an account @ Invite @ada ada Owner Linked to Not linked to any pages yet.");

    expect(await location(site.post("rosarians/invite/", ada, { handle: "@Bob" }))).toBe("/notes/-/groups/rosarians/?status=group-invited&handle=bob#sv-group-members");
    await site.post("rosarians/invite/", ada, { handle: "cy" });
    // Invited isn't joined: the group stays hidden from them until they accept.
    expect(await site.page("/notes/-/groups/rosarians/", bob)).toBeUndefined();
    expect(text(await site.page(ACCOUNT, bob))).toContain("Groups The Rosarians @ada invited you Accept Decline");

    expect(await location(site.post("rosarians/accept/", bob))).toBe("/notes/-/groups/rosarians/?status=group-joined#sv-group-members");
    expect(text(await site.page("/notes/-/groups/rosarians/?status=group-joined", bob))).toContain("rosarians · You're a member Members You joined The Rosarians. @ada ada Owner @bob bob Leave");
    expect(await location(site.post("rosarians/uninvite/", cy, { handle: "cy" }))).toBe(`${ACCOUNT}?status=group-declined&group=rosarians#sv-account-groups`);

    await site.post("rosarians/promote/", ada, { handle: "bob" });
    expect(text(await site.page(ACCOUNT, bob))).toContain("The Rosarians rosarians Owner");
    expect(await location(site.post("rosarians/remove/", bob, { handle: "ada" }))).toBe("/notes/-/groups/rosarians/?status=group-removed&handle=ada#sv-group-members");
    expect(await site.page("/notes/-/groups/rosarians/", ada)).toBeUndefined();

    expect(await auditLog(site.db)).toEqual([
      'ada auth:group:create rosarians {"displayName":"The Rosarians"}',
      'ada auth:group:invite rosarians {"account":"bob"}',
      'ada auth:group:invite rosarians {"account":"cy"}',
      "bob auth:group:accept rosarians {}",
      'cy auth:group:uninvite rosarians {"account":"cy"}',
      'ada auth:group:promote rosarians {"account":"bob"}',
      'bob auth:group:remove rosarians {"account":"ada"}',
    ]);
  });

  // Proves no route acts for anyone but the signed-in account: an invitation is accepted only by the account it names,
  // once; members can't promote themselves or manage others; outsiders learn nothing; other sites can't post.
  it("change only as the signed-in account allows", async () => {
    const site = await createSite();
    const ada = await signUp(site, 2, "ada");
    const bob = await signUp(site, 3, "bob");
    const eve = await signUp(site, 4, "eve");
    const dan = await signUp(site, 5, "dan");
    await rosarians(site, ada, [["bob", bob]]);
    await site.post("rosarians/invite/", ada, { handle: "dan" });
    const before = await auditLog(site.db);

    // Eve wasn't invited: accepting does nothing, and she can't see the group or act in it.
    expect(await location(site.post("rosarians/accept/", eve))).toBe(`${ACCOUNT}?status=group-invitation-gone&group=rosarians#sv-account-groups`);
    expect(await site.page("/notes/-/groups/rosarians/", eve)).toBeUndefined();
    for (const [route, form] of [["invite/", { handle: "eve" }], ["remove/", { handle: "bob" }], ["uninvite/", { handle: "dan" }], ["promote/", { handle: "eve" }]] as const) {
      expect((await site.post(`rosarians/${route}`, eve, form)).status).toBe(404);
    }
    // Bob is a member, not an owner.
    for (const [route, form] of [["promote/", { handle: "bob" }], ["remove/", { handle: "ada" }], ["invite/", { handle: "eve" }], ["uninvite/", { handle: "dan" }]] as const) {
      expect((await site.post(`rosarians/${route}`, bob, form)).status).toBe(403);
    }
    // Bob accepted already; doing it again changes nothing.
    expect(await location(site.post("rosarians/accept/", bob))).toBe(`${ACCOUNT}?status=group-invitation-gone&group=rosarians#sv-account-groups`);
    // Forged from another site, or signed out.
    expect((await site.post("rosarians/accept/", dan, {}, "https://evil.test")).status).toBe(403);
    expect(await location(site.post("rosarians/accept/", []))).toBe(ACCOUNT);
    expect((await site.post("", ada, { name: "evil", "display-name": "Evil" }, "https://evil.test")).status).toBe(403);

    expect(await auditLog(site.db)).toEqual(before);
    expect(text(await site.page("/notes/-/groups/rosarians/", ada))).toContain("@ada ada Owner @bob bob Make owner Remove Invitations @dan dan Withdraw");
  });

  // Proves a group always keeps an owner: the last one can't leave or be removed until there is another.
  it("always keep an owner", async () => {
    const site = await createSite();
    const ada = await signUp(site, 2, "ada");
    const bob = await signUp(site, 3, "bob");
    await rosarians(site, ada, [["bob", bob]]);

    expect(text(await site.page("/notes/-/groups/rosarians/", ada))).toContain("@ada ada Owner @bob bob Make owner Remove");
    expect(await location(site.post("rosarians/remove/", ada, { handle: "ada" }))).toBe("/notes/-/groups/rosarians/?status=group-last-owner#sv-group-members");
    expect(text(await site.page(ACCOUNT, ada))).toContain("The Rosarians rosarians Owner");

    await site.post("rosarians/promote/", ada, { handle: "bob" });
    expect(await location(site.post("rosarians/remove/", ada, { handle: "ada" }))).toBe(`${ACCOUNT}?status=group-left&group=rosarians#sv-account-groups`);
    expect(await location(site.post("rosarians/remove/", bob, { handle: "bob" }))).toBe("/notes/-/groups/rosarians/?status=group-last-owner#sv-group-members");
  });

  // Proves group names follow the handle rules, can't pose as a built-in actor or take a used name, and that what
  // people type shows as text.
  it("take a free name in the handle alphabet, and show what people type as text", async () => {
    const site = await createSite();
    const ada = await signUp(site, 2, "ada");
    const status = async (form: Record<string, string>) => new URL((await location(site.post("", ada, form)))!, ORIGIN).searchParams.get("status");

    expect(await status({ name: "rosarians", "display-name": "<img src=x onerror=alert(1)>" })).toBe("group-created");
    expect(await status({ name: "rosarians", "display-name": "Again" })).toBe("group-name-taken");
    for (const name of ["admin", "signed-in", "guest", "Not a name", "-edge"]) expect(await status({ name, "display-name": "X" })).toBe("group-name-invalid");
    expect(await status({ name: "gardeners", "display-name": " " })).toBe("group-display-name-invalid");

    const page = await site.page("/notes/-/groups/rosarians/", ada);
    expect(page?.html).not.toContain("<img src=x");
    expect(page?.title).toBe("<img src=x onerror=alert(1)>");
    expect(text(await site.page(`${ACCOUNT}?status=group-name-taken&group=rosarians&name=rosarians&display-name=Again`, ada)))
      .toContain("There's already a group named rosarians.");
  });
});

describe("a group's grants and links", () => {
  // Proves story 21 and that membership is read on every check: a member holds the group's grant while in the group,
  // and loses it on the next request once removed.
  it("reach its members while they belong to it", async () => {
    const site = await createSite();
    const root = await signUp(site, ADMIN, "root");
    const ada = await signUp(site, 2, "ada");
    const bob = await signUp(site, 3, "bob");
    await rosarians(site, ada, [["bob", bob]]);

    const grant = (actor: string) => site.request(`${AUTH}/people/grant/`, {
      method: "POST", cookies: root,
      body: new URLSearchParams({ "actor-type": "group", actor, permission: DELETE, scope: "vault:notes", path: "alliances/rosarians/", value: "allow" }),
    });
    expect(new URL((await grant("nobody")).headers.get("location")!, ORIGIN).searchParams.get("status")).toBe("group-unknown");
    await grant("rosarians");
    expect(await site.mayDelete(bob, "alliances/rosarians/roses")).toBe(true);
    expect(await site.mayDelete(bob, "kitchen")).toBe(false);

    await site.post("rosarians/remove/", ada, { handle: "bob" });
    expect(await site.mayDelete(bob, "alliances/rosarians/roses")).toBe(false);
  });

  // Proves stories 20 and 22: only a holder of auth:group-links:write links a group, never to the whole site; a link
  // gives the group's owners, not its members, everything there and below; each link and unlink is audited.
  it("give owners everything where a moderator linked the group, and only there", async () => {
    const site = await createSite();
    const root = await signUp(site, ADMIN, "root");
    const ada = await signUp(site, 2, "ada");
    const bob = await signUp(site, 3, "bob");
    await rosarians(site, ada, [["bob", bob]]);
    const link = (cookies: string[], form: Record<string, string>) => location(site.post("link/", cookies, { group: "rosarians", scope: "vault:notes", ...form }));

    // An owner can't link their own group: that would hand them the override.
    expect((await site.post("link/", ada, { group: "rosarians", scope: "vault:notes", path: "" })).status).toBe(403);
    expect(await site.page(PANEL, ada)).toBeUndefined();
    expect(await link(root, { scope: "site", path: "" })).toBe(`${PANEL}?status=group-link-invalid&group=rosarians&scope=site&path=#sv-dashboard-link`);
    expect(await link(root, { path: "alliances/../" })).toMatch(/status=group-link-invalid/);
    expect(await link(root, { group: "nobody", path: "alliances/" })).toMatch(/status=group-link-unknown/);

    expect(await link(root, { path: "alliances/rosarians/" })).toBe(`${PANEL}?status=group-linked&group=rosarians#sv-dashboard-link`);
    expect(await site.mayDelete(ada, "alliances/rosarians/roses")).toBe(true);
    expect(await site.mayDelete(ada, "alliances/gardeners/tulips")).toBe(false);
    expect(await site.mayDelete(bob, "alliances/rosarians/roses")).toBe(false);
    expect(text(await site.page(PANEL, root))).toContain("All groups The Rosarians rosarians Owned by @ada folder notes/alliances/rosarians/ Unlink");
    expect(text(await site.page("/notes/-/groups/rosarians/", bob))).toContain("Linked to folder notes/alliances/rosarians/");

    await site.post("unlink/", root, { group: "rosarians", object: "folder:notes/alliances/rosarians/" });
    expect(await site.mayDelete(ada, "alliances/rosarians/roses")).toBe(false);
    expect((await auditLog(site.db)).filter((entry) => entry.includes("link"))).toEqual([
      'root auth:group:link folder:notes/alliances/rosarians/ {"group":"rosarians"}',
      'root auth:group:unlink folder:notes/alliances/rosarians/ {"group":"rosarians"}',
    ]);
  });

  // An owner holds every permission where the group is linked, the one to grant included. That reaches as far as the
  // link and no further: not the site, not roles, which reach the whole site, and not another vault.
  it("let an owner grant inside a linked vault, but not on the site, on roles or in another vault", async () => {
    const site = await createSite({ vaults: ["notes", "docs"] });
    const root = await signUp(site, ADMIN, "root");
    const ada = await signUp(site, 2, "ada");
    await rosarians(site, ada, []);
    await site.post("link/", root, { group: "rosarians", scope: "vault:notes", path: "" });
    const people = (route: string, form: Record<string, string>) =>
      site.request(`${AUTH}/people/${route}`, { method: "POST", cookies: ada, body: new URLSearchParams(form) });
    const grantSelf = (scope: string, path = "") =>
      people("grant/", { "actor-type": "account", actor: "ada", permission: "auth:grants:write", scope, path, value: "allow" });

    expect((await grantSelf("site")).status).toBe(403);
    expect((await grantSelf("vault:docs")).status).toBe(403);
    expect((await people("role/", { name: "editors" })).status).toBe(403);
    expect((await site.post("link/", ada, { group: "rosarians", scope: "vault:docs", path: "" })).status).toBe(403);

    expect(await location(grantSelf("vault:notes", "kitchen/"))).toMatch(/status=grant-saved/);
    expect((await auditLog(site.db)).filter((entry) => entry.startsWith("ada auth:grant"))).toEqual([
      expect.stringContaining("ada auth:grant:set folder:notes/kitchen/"),
    ]);
  });

  it("show no message for a status that only names something every object has", async () => {
    const site = await createSite();
    const ada = await signUp(site, 2, "ada");
    await rosarians(site, ada, []);

    expect(text(await site.page("/notes/-/groups/rosarians/?status=toString", ada))).toContain("The Rosarians");
  });
});

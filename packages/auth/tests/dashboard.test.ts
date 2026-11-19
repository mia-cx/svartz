import { createServer, type PermissionDeclaration, type PluginPage, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { audit, can, readAccount } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const DASHBOARD = "/notes/-/dashboard/";
const PANEL = `${DASHBOARD}auth/people/`;
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const ADMIN = 1;

const PERMISSIONS: PermissionDeclaration[] = [
  { slug: "guestbook:entries:delete", name: "Delete any entry", description: "Remove anyone's entry." },
  { slug: "moderation:reports:read", name: "See reports", description: "Open the report queue." },
];

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> } };
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
 * A vault at /notes with auth (GitHub user 1 is the admin), a `moderation` plugin whose Reports panel needs
 * `moderation:reports:read`, and a `probe` plugin answering `can(reader, ?permission, { vault: "notes", page: ?page })`.
 */
function site(db: Database) {
  const probe = (): ServerHandler => async (request, context) => {
    const url = new URL(request.url);
    const permission = url.searchParams.get("permission") as PermissionDeclaration["slug"];
    return Response.json(await can(await readAccount(request, context.env), permission, { vault: "notes", page: url.searchParams.get("page") ?? undefined }, context.env));
  };
  const reports = { id: "reports", title: "Reports", permission: "moderation:reports:read", render: () => ({ title: "Reports", html: "<h1>Reports</h1>" }) };
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard"], load: () => import("../src/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins: [`github:${ADMIN}`], permissions: PERMISSIONS, vaults: ["notes", "docs"],
        },
        data: { permissions: [], paths: ["garden/", "garden/roses"] },
      },
      { id: "moderation", load: async () => ({ default: () => ({ dashboard: { title: "Moderation", panels: [reports] } }) }) },
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
  const page = async (path: string, cookies: string[] = []): Promise<PluginPage | undefined> => {
    const result = await server.page(event(path, { headers: { cookie: cookies.join("; ") } }));
    if (result && "redirect" in result) throw new Error("unexpected redirect");
    return result;
  };
  const post = (route: string, cookies: string[], form: Record<string, string>, origin?: string) =>
    request(`${AUTH}/people/${route}/`, { method: "POST", cookies, body: new URLSearchParams(form), ...origin !== undefined && { origin } });
  const ask = async (cookies: string[], permission: string, page?: string) =>
    (await request(`/notes/_svartz/probe/?${new URLSearchParams({ permission, ...page !== undefined && { page } })}`, { cookies })).json();
  return { request, page, post, ask };
}
type Site = ReturnType<typeof site>;

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
  return cookiesFrom(chosen);
}

/** What a reader sees of `html`: its text, with entities as their characters. */
const seen = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
  .replace(/\s+/g, " ").trim();
const text = (page: PluginPage | undefined) => seen(page?.html ?? "");
const auditLog = async (db: Database) => (await db.prepare("SELECT actor_handle, action, target, detail FROM auth_audit ORDER BY id").bind().all()).results
  .map((row) => ({ ...row, detail: JSON.parse(row.detail as string) }));
const grant = (route: Site["post"], cookies: string[], fields: Record<string, string>) =>
  route("grant", cookies, { "actor-type": "account", scope: "vault:notes", path: "", value: "allow", ...fields });

describe("/-/dashboard/", () => {
  // Proves story 43 and the gate: each viewer sees exactly the panels they hold, plugins with none are left out, and a
  // viewer with no panel gets the 404, whatever URL they type.
  it("lists only the panels a viewer may open, and is absent for anyone with none", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    const reader = await signUp(tour, 2, "reader");
    const moderator = await signUp(tour, 3, "mod");
    await grant(tour.post, admin, { actor: "mod", permission: "moderation:reports:read" });

    expect(text(await tour.page(DASHBOARD, admin))).toBe("Dashboard Accounts People & permissions Reputation Kudos Moderation Reports");
    expect(text(await tour.page(DASHBOARD, moderator))).toBe("Dashboard Moderation Reports");
    expect(await tour.page(`${DASHBOARD}moderation/reports/`, moderator)).toEqual({ title: "Reports", html: expect.stringContaining("<h1>Reports</h1>") });
    expect(await tour.page(PANEL, moderator)).toBeUndefined();
    for (const cookies of [reader, []]) {
      expect(await tour.page(DASHBOARD, cookies)).toBeUndefined();
      expect(await tour.page(PANEL, cookies)).toBeUndefined();
      expect(await tour.page(`${DASHBOARD}moderation/reports/`, cookies)).toBeUndefined();
    }
    expect(await (await tour.request(`${AUTH}/viewer/`, { cookies: moderator })).json()).toEqual({ handle: "mod", dashboard: true });
    expect(await (await tour.request(`${AUTH}/viewer/`, { cookies: reader })).json()).toEqual({ handle: "reader", dashboard: false });
    expect(await (await tour.request(`${AUTH}/viewer/`)).json()).toBeNull();
  });
});

describe("People & permissions", () => {
  // Proves stories 11 and 12: a grant set on a folder from the panel decides can() below it, unset takes it back, and
  // each change lands in the audit log with who made it.
  it("grants, denies and unsets an account's permission on a folder, recording each change", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    const reader = await signUp(tour, 2, "reader");

    const saved = await grant(tour.post, admin, { actor: "@Reader", permission: "guestbook:entries:delete", path: "garden/" });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe(`${PANEL}?status=grant-saved#sv-dashboard-grants`);
    expect(await tour.ask(reader, "guestbook:entries:delete", "garden/roses")).toBe(true);
    expect(await tour.ask(reader, "guestbook:entries:delete", "kitchen")).toBe(false);
    expect(text(await tour.page(PANEL, admin))).toContain("@reader · Delete any entry folder notes/garden/ Allowed Unset");

    await grant(tour.post, admin, { actor: "reader", permission: "guestbook:entries:delete", path: "garden/roses", value: "deny" });
    expect(await tour.ask(reader, "guestbook:entries:delete", "garden/roses")).toBe(false);
    // The row's Unset button sends the object whole.
    await tour.post("grant", admin, { "actor-type": "account", actor: "reader", permission: "guestbook:entries:delete", object: "page:notes/garden/roses", value: "unset" });
    expect(await tour.ask(reader, "guestbook:entries:delete", "garden/roses")).toBe(true);

    expect(await auditLog(db)).toEqual([
      { actor_handle: "root", action: "auth:grant:set", target: "folder:notes/garden/", detail: { actorType: "account", actor: "reader", permission: "guestbook:entries:delete", value: "allow" } },
      { actor_handle: "root", action: "auth:grant:set", target: "page:notes/garden/roses", detail: { actorType: "account", actor: "reader", permission: "guestbook:entries:delete", value: "deny" } },
      { actor_handle: "root", action: "auth:grant:set", target: "page:notes/garden/roses", detail: { actorType: "account", actor: "reader", permission: "guestbook:entries:delete", value: "unset" } },
    ]);
  });

  // Proves story 13: a role's grants reach exactly the accounts that hold it, while they hold it.
  it("creates a role, grants it, and gives and takes it from accounts", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    const reader = await signUp(tour, 2, "reader");

    expect((await tour.post("role", admin, { name: "Editors" })).headers.get("location")).toBe(`${PANEL}?status=role-created&name=editors#sv-dashboard-roles`);
    await grant(tour.post, admin, { "actor-type": "role", actor: "editors", permission: "guestbook:entries:delete", scope: "site" });
    expect(await tour.ask(reader, "guestbook:entries:delete")).toBe(false);

    await tour.post("member", admin, { role: "editors", handle: "@reader" });
    expect(await tour.ask(reader, "guestbook:entries:delete")).toBe(true);
    expect(text(await tour.page(PANEL, admin))).toMatch(/editors @reader reader Remove Add an account to editors/);
    // The Roles link and the redirects above land on an id, so each id on the page names one element.
    const ids = [...(await tour.page(PANEL, admin) as { html: string }).html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    await tour.post("member/remove", admin, { role: "editors", handle: "reader" });
    expect(await tour.ask(reader, "guestbook:entries:delete")).toBe(false);
    expect((await auditLog(db)).map(({ action, target }) => `${action} ${target}`)).toEqual([
      "auth:role:create editors", "auth:grant:set site", "auth:role:add-member editors", "auth:role:remove-member editors",
    ]);
  });

  // Proves story 16: the check names the grant or rule that decided, for any account, without changing anything.
  it("answers whether an account may do something somewhere, and why", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "reader");
    await tour.post("role", admin, { name: "editors" });
    await tour.post("member", admin, { role: "editors", handle: "reader" });
    await grant(tour.post, admin, { "actor-type": "role", actor: "editors", permission: "guestbook:entries:delete", path: "garden/" });
    const check = async (handle: string, path: string) => {
      const query = new URLSearchParams({ check: handle, "check-permission": "guestbook:entries:delete", "check-scope": "vault:notes", "check-path": path });
      const html = (await tour.page(`${PANEL}?${query}`, admin))!.html;
      return seen(/id="sv-dashboard-check-status"[^>]*>(.*?)<\/(?:div|p)>\n/s.exec(html)![1]!);
    };

    expect(await check("reader", "garden/roses")).toBe("Yes. @reader may: Delete any entry, on page notes/garden/roses. A grant allows role editors on folder notes/garden/.");
    expect(await check("reader", "kitchen")).toBe("No. @reader may not: Delete any entry, on page notes/kitchen. No grant gives it, here or anywhere above.");
    expect(await check("root", "kitchen")).toBe("Yes. @root may: Delete any entry, on page notes/kitchen. @root is an admin, and admins may do everything.");
    expect(await check("nobody", "kitchen")).toBe("No account has the handle @nobody.");
  });

  // Proves the server is the gate: a viewer who may only look, a signed-out one, and a forged cross-site form all
  // change nothing, whatever the page showed them.
  it("refuses changes from anyone without auth:grants:write, and from other sites", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    const looker = await signUp(tour, 2, "looker");
    await grant(tour.post, admin, { actor: "looker", permission: "auth:grants:read" });

    const panel = await tour.page(PANEL, looker);
    expect(text(panel)).toContain("Grants @looker · See people and permissions");
    expect(panel?.html).not.toContain("<form class=\"sv-account-form sv-dashboard-grid\" method=\"post\"");

    const attempts = [
      await grant(tour.post, looker, { actor: "looker", permission: "auth:grants:write" }),
      await tour.post("role", looker, { name: "editors" }),
      await grant(tour.post, [], { actor: "looker", permission: "auth:grants:write" }),
      await grant((route, cookies, form) => tour.post(route, cookies, form, "https://evil.test"), admin, { actor: "looker", permission: "auth:grants:write" }),
    ];
    expect(attempts.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    expect(await tour.ask(looker, "auth:grants:write")).toBe(false);
    expect(await auditLog(db)).toHaveLength(1);
  });

  // Proves admin stays config-only, and every object comes from the picker's rules: no other vault, no dot segments.
  it("refuses the admin role, grants on an admin, and objects the picker can't name", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    const reader = await signUp(tour, 2, "reader");
    const status = async (response: Promise<Response>) => new URL((await response).headers.get("location")!, ORIGIN).searchParams.get("status");

    expect(await status(tour.post("role", admin, { name: "admin" }))).toBe("role-invalid");
    expect(await status(tour.post("role", admin, { name: "<b>x</b>" }))).toBe("role-invalid");
    expect(await status(grant(tour.post, admin, { "actor-type": "role", actor: "admin", permission: "guestbook:entries:delete" }))).toBe("admin-role");
    expect(await status(grant(tour.post, admin, { actor: "root", permission: "guestbook:entries:delete", value: "deny" }))).toBe("admin-account");
    for (const object of [{ path: "garden/../../x" }, { path: "./garden/" }, { scope: "vault:elsewhere" }, { scope: "site", path: "garden/" }]) {
      expect(await status(grant(tour.post, admin, { actor: "reader", permission: "guestbook:entries:delete", ...object }))).toBe("object-invalid");
    }
    expect(await status(tour.post("grant", admin, { "actor-type": "account", actor: "reader", permission: "guestbook:entries:delete", object: "folder:elsewhere/x/", value: "allow" }))).toBe("object-invalid");
    expect(await status(grant(tour.post, admin, { actor: "reader", permission: "guestbook:entries:burn" }))).toBe("permission-unknown");

    expect(await tour.ask(reader, "guestbook:entries:delete", "x")).toBe(false);
    expect(await auditLog(db)).toEqual([]);
  });

  // Proves the panel shows what readers supplied as text, and keeps account ids on the server.
  it("escapes names and never shows account ids", async () => {
    const db = await createDatabase();
    const tour = site(db);
    const admin = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "mallory", "<img src=x onerror=alert(1)>");
    await tour.post("role", admin, { name: "editors" });
    await tour.post("member", admin, { role: "editors", handle: "mallory" });

    const panel = await tour.page(`${PANEL}?people=mall`, admin);
    const { results } = await db.prepare("SELECT id FROM auth_accounts").bind().all();

    expect(panel?.html).not.toContain("<img src=x");
    expect(panel?.html).toContain("&#60;img src=x onerror=alert(1)&#62;");
    for (const { id } of results) expect(panel?.html).not.toContain(id as string);
  });
});

describe("audit", () => {
  // Proves the write API plugins share: an entry lands with its change or not at all, and nothing rewrites the log.
  it("records an entry with the change it describes, atomically, and keeps the log append-only", async () => {
    const db = await createDatabase();
    const tour = site(db);
    await signUp(tour, ADMIN, "root");
    const env = { SVARTZ_DB: db };
    const actor = { id: "a1", handle: "root" };
    await db.prepare("CREATE TABLE reports (id TEXT PRIMARY KEY)").bind().run();
    const insert = (id: string) => db.prepare("INSERT INTO reports (id) VALUES (?)").bind(id);

    await audit(env, { actor, action: "moderation:report:resolve", target: "r1", detail: { note: "spam" } }, [insert("r1") as never]);
    await expect(audit(env, { actor, action: "moderation:report:resolve", target: "r1" }, [insert("r1") as never])).rejects.toThrow();

    expect(await auditLog(db)).toEqual([{ actor_handle: "root", action: "moderation:report:resolve", target: "r1", detail: { note: "spam" } }]);
    await expect(db.prepare("UPDATE auth_audit SET actor_handle = 'someone'").bind().run()).rejects.toThrow(/append-only/);
    await expect(db.prepare("DELETE FROM auth_audit").bind().run()).rejects.toThrow(/append-only/);
    await expect(audit({}, { actor, action: "moderation:report:resolve", target: "r1" })).rejects.toThrow(/SVARTZ_DB/);
  });
});

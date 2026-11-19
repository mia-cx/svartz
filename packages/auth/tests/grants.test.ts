import { createServerHandle, type PermissionDeclaration, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { can, readAccount } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";

const PERMISSIONS: PermissionDeclaration[] = [
  { slug: "guestbook:entries:write", name: "Sign the guestbook", description: "Add an entry.", defaults: { "signed-in": "allow" } },
  { slug: "guestbook:entries:read", name: "Read the guestbook", description: "See entries.", defaults: { guest: "allow" } },
  { slug: "guestbook:entries:delete", name: "Delete any entry", description: "Remove anyone's entry." },
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
 * A vault at /notes with auth, as config resolution registers it with the site's catalogue, and a `probe` plugin that
 * answers `can(reader, ?permission, { vault: "notes", page: ?page })`.
 */
function site(db: Database | undefined, { admins = [] as string[], built = [] as PermissionDeclaration[], userPages = undefined as string | undefined } = {}) {
  const probe = (): ServerHandler => async (request, context) => {
    const url = new URL(request.url);
    const page = url.searchParams.get("page") ?? undefined;
    const permission = url.searchParams.get("permission") as PermissionDeclaration["slug"];
    return Response.json(await can(await readAccount(request, context.env), permission, { vault: "notes", page }, context.env));
  };
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth",
        eager: true,
        load: () => import("../src/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins,
          permissions: PERMISSIONS,
          userPageVault: "notes",
          ...userPages && { userPages },
        },
        // What the plugin's build hook collected from the build's final plugins.
        data: { permissions: built, userPages: {} },
      },
      { id: "probe", load: async () => ({ default: probe }) },
    ],
  }, { privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", ...db && { SVARTZ_DB: db } }, building: false, dev: false });
  return (path: string, { cookies = [] as string[], method = "GET", body }: { cookies?: string[]; method?: string; body?: URLSearchParams } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (method === "POST") headers.set("origin", ORIGIN);
    const request = new Request(`${ORIGIN}${path}`, { method, headers, body });
    return handle({ event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" }, resolve: async () => new Response("page") });
  };
}
type Site = ReturnType<typeof site>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub for the first time as user `id`, choosing `handle`, and answer the cookies a browser keeps. */
async function signUp(request: Site, id: number, handle: string): Promise<string[]> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id, login: handle });
    return new Response(null, { status: 404 });
  });
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: cookiesFrom(start) });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle }) });
  return cookiesFrom(chosen);
}

const ask = async (request: Site, permission: string, { cookies = [] as string[], page }: { cookies?: string[]; page?: string } = {}) => {
  const query = new URLSearchParams({ permission, ...page !== undefined && { page } });
  const response = await request(`/notes/_svartz/probe/?${query}`, { cookies });
  return response.status === 200 ? response.json() : response.status;
};

async function store(db: Database, actorType: string, actorId: string, object: string, permission: string, value: string) {
  await db.prepare(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (permission, object, actor_type, actor_id) DO UPDATE SET value = excluded.value`)
    .bind(actorType, actorId, object, permission, value, "2026-11-19T00:00:00.000Z").run();
}

async function accountId(db: Database, handle: string): Promise<string> {
  const { results: [row] } = await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(handle).all();
  return row!.id as string;
}

describe("can", () => {
  it("applies each permission's declared defaults to guests and signed-in readers", async () => {
    const request = site(await createDatabase());
    const ada = await signUp(request, 1, "ada");

    expect(await ask(request, "guestbook:entries:write")).toBe(false);
    expect(await ask(request, "guestbook:entries:write", { cookies: ada })).toBe(true);
    // A signed-in reader is a guest too.
    expect(await ask(request, "guestbook:entries:read")).toBe(true);
    expect(await ask(request, "guestbook:entries:read", { cookies: ada })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada })).toBe(false);
  });

  it("lets a stored grant to the same built-in actor replace a default, unset included", async () => {
    const db = await createDatabase();
    const request = site(db);
    const ada = await signUp(request, 1, "ada");

    await store(db, "static", "signed-in", "site", "guestbook:entries:write", "unset");
    await store(db, "static", "guest", "site", "guestbook:entries:read", "deny");

    expect(await ask(request, "guestbook:entries:write", { cookies: ada })).toBe(false);
    expect(await ask(request, "guestbook:entries:read")).toBe(false);
  });

  it("scopes an account's grant to its page and what the page encloses, not to the pages beside it", async () => {
    const db = await createDatabase();
    const request = site(db);
    const ada = await signUp(request, 1, "ada");
    const grace = await signUp(request, 2, "grace");
    await store(db, "account", await accountId(db, "ada"), "folder:notes/garden/", "guestbook:entries:delete", "allow");
    await store(db, "account", await accountId(db, "ada"), "page:notes/garden/weeds", "guestbook:entries:delete", "deny");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "garden/roses" })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "garden/weeds" })).toBe(false);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "kitchen" })).toBe(false);
    expect(await ask(request, "guestbook:entries:delete", { cookies: grace, page: "garden/roses" })).toBe(false);
  });

  it("checks a deeply nested page in one load", async () => {
    const db = await createDatabase();
    const request = site(db);
    const ada = await signUp(request, 1, "ada");
    await store(db, "account", await accountId(db, "ada"), "folder:notes/a/", "guestbook:entries:delete", "allow");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: Array(300).fill("a").join("/") })).toBe(true);
  });

  it("allows a bootstrap admin everything, over a stored deny", async () => {
    const db = await createDatabase();
    const request = site(db, { admins: ["github:1"] });
    const ada = await signUp(request, 1, "ada");
    await store(db, "account", await accountId(db, "ada"), "site", "guestbook:entries:delete", "deny");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada })).toBe(true);
  });

  it("allows an account everything on its own user page", async () => {
    const request = site(await createDatabase());
    const ada = await signUp(request, 1, "ada");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/ada" })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/grace" })).toBe(false);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/ada/drafts" })).toBe(false);
  });

  it("finds user pages in the folder the auth plugin names", async () => {
    const request = site(await createDatabase(), { userPages: "people" });
    const ada = await signUp(request, 1, "ada");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "people/ada" })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/ada" })).toBe(false);
  });

  it("keeps an account's user page its own under a handle it changed from, and gives it no one else's", async () => {
    const request = site(await createDatabase());
    const ada = await signUp(request, 1, "ada");
    await signUp(request, 2, "grace");
    const renamed = await request(`${AUTH}/account/profile/`, { method: "POST", cookies: ada, body: new URLSearchParams({ name: "Ada", handle: "lovelace" }) });
    expect(renamed.headers.get("location")).toContain("status=saved");

    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/ada" })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/lovelace" })).toBe(true);
    expect(await ask(request, "guestbook:entries:delete", { cookies: ada, page: "users/grace" })).toBe(false);
  });

  it("refuses everything without SVARTZ_DB, defaults included", async () => {
    const request = site(undefined);

    expect(await ask(request, "guestbook:entries:read")).toBe(false);
  });

  it("checks a permission only the build's final plugins declared, such as a theme preset's", async () => {
    const stickers: PermissionDeclaration = { slug: "stickers:packs:read", name: "See sticker packs", description: "Browse packs.", defaults: { guest: "allow" } };
    const request = site(await createDatabase(), { built: [stickers] });

    expect(await ask(request, "stickers:packs:read")).toBe(true);
  });

  it("fails the request for a permission no plugin declared", async () => {
    const request = site(await createDatabase());

    await expect(ask(request, "guestbook:entries:burn" as string)).rejects.toThrow(/"guestbook:entries:burn" isn't a declared permission/);
  });
});

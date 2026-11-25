import { createServer, type PermissionDeclaration, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "../src/seal";

const ORIGIN = "https://site.test";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const EDIT: PermissionDeclaration = { slug: "wiki:pages:edit", name: "Edit pages", description: "Change a page." };

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> } };
}

const disposers: Array<() => Promise<void>> = [];
// Each test is a fresh isolate: no vault's auth module has started yet.
beforeEach(() => vi.resetModules());
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function createDatabase(): Promise<Database> {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  return await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
}

type Pages = Record<string, string | null>;

/**
 * Host vaults sharing `db`, in `order`, chained as the generated host middleware chains them: a request one vault
 * answers never reaches the vaults after it, and plugin pages render once every vault's handle has passed the request
 * on. `journal` runs sign-in, so it holds user pages. `pages` is what each vault's build recorded, by vault id. Each
 * vault has a `probe` plugin answering the reader's handle and `can(reader, "wiki:pages:edit", { vault, page: ?page })`.
 */
function host(db: Database, { order = ["journal", "work"], pages = {} as Record<string, Pages> } = {}) {
  const providers = { github: { clientId: "gh-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } };
  const probe = (vault: string): ServerHandler => async (request, context) => {
    const { can, readAccount } = await import("../src/server");
    const page = new URL(request.url).searchParams.get("page")!;
    const account = await readAccount(request, context.env);
    return Response.json({ handle: account?.handle ?? null, allowed: await can(account, EDIT.slug, { vault, page }, context.env) });
  };
  const servers = order.map((id) => createServer({
    basePath: `/${id}`,
    vault: { id, mountPath: `/${id}`, site: { title: id } },
    servers: [
      {
        id: "auth",
        eager: true,
        pages: ["account"],
        load: () => import("../src/server"),
        options: { providers, permissions: [EDIT], userPageVault: "journal", ...id !== "journal" && { callbackMountPath: "/journal" } },
        data: { permissions: [], ...pages[id] && { userPages: pages[id] } },
      },
      { id: "probe", load: async () => ({ default: () => probe(id) }) },
    ],
  }, { privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "gh", SVARTZ_DB: db }, building: false, dev: false }));

  type Event = { request: Request; url: URL; getClientAddress: () => string };
  const render = async (event: Event): Promise<Response> => {
    for (const server of servers) {
      const page = await server.page(event);
      if (page && "html" in page) return new Response(page.html);
    }
    return new Response("page");
  };
  const chain = servers.reduceRight<(event: Event) => Promise<Response>>(
    (next, server) => (event) => server.handle({ event, resolve: next }),
    render,
  );
  return (path: string, { cookies = [] as string[], method = "GET", body }: { cookies?: string[]; method?: string; body?: URLSearchParams } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (method === "POST") headers.set("origin", ORIGIN);
    const request = new Request(new URL(path, ORIGIN), { method, headers, body });
    return chain({ request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" });
  };
}
type Host = ReturnType<typeof host>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub for the first time as `login` through the callback vault, and answer the handle chooser's response. */
async function chooseHandle(request: Host, id: number, login: string, handle = login): Promise<Response> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id, login });
    return new Response(null, { status: 404 });
  });
  const start = await request("/journal/_svartz/auth/start/github/?returnTo=/journal/");
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`/journal/_svartz/auth/callback/github/?code=issued&state=${state}`, { cookies: cookiesFrom(start) });
  return request("/journal/_svartz/auth/handle/", { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle }) });
}

/** Who `cookies` read as through `vault`'s probe, and whether they may edit `page` there. */
const ask = async (request: Host, vault: string, page: string, cookies: string[]) =>
  (await request(`/${vault}/_svartz/probe/?page=${encodeURIComponent(page)}`, { cookies })).json();
const canEdit = async (request: Host, vault: string, page: string, cookies: string[]) => (await ask(request, vault, page, cookies)).allowed;

describe("user pages in a host app with several vaults", () => {
  // Proves a page at the user page path of a vault that doesn't run sign-in is an ordinary page: choosing its handle
  // gains nothing there, whichever vault answered first.
  it("gives no override on another vault's page, even one its build found before that vault started", async () => {
    const request = host(await createDatabase(), { pages: { work: { victim: "/work/users/victim/" } } });

    const chosen = await chooseHandle(request, 1, "victim");

    expect(chosen.status).toBe(303);
    expect(await canEdit(request, "work", "users/victim", cookiesFrom(chosen))).toBe(false);
    expect(await canEdit(request, "journal", "users/victim", cookiesFrom(chosen))).toBe(true);
  });

  // Proves the callback vault's own build reserves its user pages' handles from the very first request.
  it("refuses a handle whose page the callback vault holds, on a cold start", async () => {
    const request = host(await createDatabase(), { pages: { journal: { ada: "/journal/users/ada/" } } });

    const refused = await chooseHandle(request, 1, "ada");

    expect([refused.status, await refused.text()]).toEqual([422, expect.stringContaining("@ada is taken")]);
  });

  // Proves a handle change made from another vault's account page runs where user pages live, and returns there.
  it("checks a handle change from an earlier vault's account page against the callback vault's pages", async () => {
    const db = await createDatabase();
    const pages = { journal: { ada: "/journal/users/ada/" } };
    const session = cookiesFrom(await chooseHandle(host(db, { order: ["work", "journal"], pages }), 1, "grace"));
    // A fresh isolate, whose first request goes to the vault that answers before the callback vault.
    vi.resetModules();
    const request = host(db, { order: ["work", "journal"], pages });
    const form = new URLSearchParams({ name: "Grace", handle: "ada" });

    expect((await request("/work/_svartz/auth/account/profile/", { method: "POST", cookies: session, body: form })).status).toBe(404);
    const html = await (await request("/work/-/account/", { cookies: session })).text();
    const action = /<form[^>]+action="([^"]*\/account\/profile\/[^"]*)"/.exec(html)![1]!.replaceAll("&amp;", "&");
    const taken = await request(action, { method: "POST", cookies: session, body: form });

    expect(taken.headers.get("location")).toBe("/work/-/account/?status=handle-taken&name=Grace&handle=ada");
    expect((await ask(request, "journal", "users/ada", session)).handle).toBe("grace");
  });

  // Proves a cookie from before accounts never becomes an account before the callback vault's pages are known, and
  // then gets a handle they don't reserve.
  it("upgrades a cookie from before accounts only once the callback vault has started", async () => {
    const request = host(await createDatabase(), { order: ["work", "journal"], pages: { journal: { octocat: "/journal/users/octocat/" } } });
    const legacy = [`__Host-svartz-session=${await seal({ id: "github:583231", provider: "github", name: "The Octocat", handle: "octocat" }, SECRET, "session", 60)}`];

    expect(await ask(request, "work", "users/octocat", legacy)).toEqual({ handle: null, allowed: false });
    expect(await ask(request, "journal", "users/octocat", legacy)).toEqual({ handle: "octocat-2", allowed: false });
  });
});

describe("handles free of user pages", () => {
  // `<folder>/<name>.md` named after its folder is that folder's own note, so it can never be the user page of @<name>.
  it("keeps the user page folder's own name from any account", async () => {
    const { useUserPages, userPageFree } = await import("../src/user-pages");
    useUserPages({ vault: "wiki", folder: "wiki/people" });

    expect(userPageFree({}, "people")).toBe(false);
    expect(userPageFree({ ada: "/wiki/people/ada/" }, "ada")).toBe(false);
    expect(userPageFree({}, "ada")).toBe(true);
  });
});

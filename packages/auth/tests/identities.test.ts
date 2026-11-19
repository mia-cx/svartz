import { createServerHandle, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkedIdentities, readAccount } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
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

/** A vault at /notes with auth and a `probe` plugin answering the signed-in reader's linked identities. */
function site(db: Database) {
  const probe = (): ServerHandler => async (request, context) => {
    const account = await readAccount(request, context.env);
    return Response.json(account && await linkedIdentities(account, context.env));
  };
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth",
        eager: true,
        load: () => import("../src/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } },
      },
      { id: "probe", load: async () => ({ default: probe }) },
    ],
  }, {
    privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop", PRIVATE_GITHUB_SECRET: "fake-client-secret", SVARTZ_DB: db },
    building: false,
    dev: false,
  });
  return (path: string, { cookies = [] as string[], method = "GET", body }: { cookies?: string[]; method?: string; body?: URLSearchParams } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (method === "POST") headers.set("origin", ORIGIN);
    const request = new Request(`${ORIGIN}${path}`, { method, headers, body });
    return handle({ event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" }, resolve: async () => new Response("page") });
  };
}
type Site = ReturnType<typeof site>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub for the first time as user `id`, choosing `login` as the handle, and answer the browser's cookies. */
async function signUp(request: Site, id: number, login: string, name: string): Promise<string[]> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id, login, name, html_url: `https://github.com/${login}` });
    return new Response(null, { status: 404 });
  });
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: cookiesFrom(start) });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle: login }) });
  return cookiesFrom(chosen);
}

describe("linkedIdentities", () => {
  it("lists every provider account linked to the reader's account, the first linked first, and no one else's", async () => {
    const db = await createDatabase();
    const request = site(db);
    const ada = await signUp(request, 583231, "ada", "Ada Lovelace");
    await signUp(request, 2, "grace", "Grace Hopper");
    // Linking a second provider has no route yet: store the link as the account page will.
    await db.prepare(`INSERT INTO auth_identities (id, account_id, provider, name, handle, created_at, updated_at)
      SELECT 'discord:80351110224678912', account_id, 'discord', 'Ada', 'ada.l', '2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z'
      FROM auth_identities WHERE id = 'github:583231'`).bind().run();

    const answer = await request("/notes/_svartz/probe/", { cookies: ada });

    expect(await answer.json()).toEqual([
      {
        id: "github:583231",
        provider: "github",
        name: "Ada Lovelace",
        handle: "ada",
        avatarUrl: "https://github.com/ada.png",
        profileUrl: "https://github.com/ada",
      },
      { id: "discord:80351110224678912", provider: "discord", name: "Ada", handle: "ada.l" },
    ]);
  });

  it("answers none on a site without accounts", async () => {
    expect(await linkedIdentities({ id: "0b9f6c1e" }, {})).toEqual([]);
  });
});

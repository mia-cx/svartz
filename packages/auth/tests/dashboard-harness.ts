/**
 * A vault at /notes with auth on a real D1, for the dashboard's browser tests: `root` is the admin, `mod` holds only
 * `moderation:reports:read`, which opens a `moderation` plugin's Reports panel, and `reader` holds nothing. The vitest
 * config runs it in Node and hands the browser what it renders.
 */
import { createServer, type PageResult } from "@svartz/core";
import { Miniflare } from "miniflare";

export const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";

export type Viewer = "root" | "mod" | "reader";
const GITHUB_IDS: Readonly<Record<Viewer, number>> = { root: 1, mod: 2, reader: 3 };

export async function createDashboardSite() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  const db = await miniflare.getD1Database("SVARTZ_DB");
  const reports = { id: "reports", title: "Reports", permission: "moderation:reports:read", render: () => ({ title: "Reports", html: "<h1>Reports</h1>" }) };
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard", "groups"], load: () => import("../src/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins: ["github:1"],
          permissions: [{ slug: "moderation:reports:read", name: "See reports", description: "Open the report queue." }],
        },
        data: { permissions: [], paths: ["garden/", "garden/roses"] },
      },
      { id: "moderation", load: async () => ({ default: () => ({ dashboard: { title: "Moderation", panels: [reports] } }) }) },
    ],
  }, { privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", SVARTZ_DB: db }, building: false, dev: false });

  const event = (url: string, init: RequestInit = {}) => {
    const request = new Request(url, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  /** Answer a request to the vault's plugin routes. */
  const handle = (request: Request) => server.handle({ event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" }, resolve: async () => new Response(null, { status: 404 }) });
  const fetchAt = (path: string, init: RequestInit = {}) => handle(new Request(`${ORIGIN}${path}`, init));

  /** Sign up GitHub user `viewer` with that handle, as the callback would; answer the session cookie's `name=value`. */
  async function signUp(viewer: Viewer): Promise<string> {
    const start = await fetchAt(`${AUTH}/start/github/`);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
      if (url === "https://api.github.com/user") return Response.json({ id: GITHUB_IDS[viewer], login: viewer });
      return realFetch(input, init);
    };
    try {
      const cookies = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
      const back = await fetchAt(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { headers: { cookie: cookies(start).join("; ") } });
      const chosen = await fetchAt(`${AUTH}/handle/`, {
        method: "POST", headers: { cookie: cookies(back).join("; "), origin: ORIGIN }, body: new URLSearchParams({ handle: viewer }),
      });
      return cookies(chosen).find((pair) => pair.startsWith("__Host-svartz-session="))!;
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  const sessions = { root: await signUp("root"), mod: await signUp("mod"), reader: await signUp("reader") };
  await fetchAt(`${AUTH}/people/grant/`, {
    method: "POST", headers: { cookie: sessions.root, origin: ORIGIN },
    body: new URLSearchParams({ "actor-type": "account", actor: "mod", permission: "moderation:reports:read", scope: "site", path: "", value: "allow" }),
  });

  return {
    sessions,
    handle,
    /** The page at `path` as `viewer` sees it, or `null` for the 404. */
    page: async (viewer: Viewer, path: string): Promise<PageResult | null> =>
      await server.page(event(`${ORIGIN}${path}`, { headers: { cookie: sessions[viewer] } })) ?? null,
    dispose: () => miniflare.dispose(),
  };
}

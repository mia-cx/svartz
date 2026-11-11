import { createServerHandle, type ServerHandler } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readIdentity } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const ENV = {
  PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
  PRIVATE_GITHUB_SECRET: "fake-client-secret",
};
const OCTOCAT = {
  id: 583231,
  login: "octocat",
  name: "The Octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
  html_url: "https://github.com/octocat",
};

/** A vault mounted at /notes with the auth plugin and a plugin that greets whoever is signed in. */
function site(env: Record<string, string> = ENV) {
  const greeter = (): ServerHandler => async (request, context) => Response.json({ signedIn: await readIdentity(request, context.env) });
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth",
        load: () => import("../src/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } },
      },
      { id: "greeter", load: async () => ({ default: greeter }) },
    ],
  }, { privateEnv: env, building: false, dev: false });
  return (path: string, { cookies = [] as string[], method = "GET", origin }: { cookies?: string[]; method?: string; origin?: string } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (origin) headers.set("origin", origin);
    const request = new Request(`${ORIGIN}${path}`, { method, headers });
    return handle({
      event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" },
      resolve: async () => new Response("page"),
    });
  };
}

/** `name=value` pairs a browser would send back, from a response's Set-Cookie headers. */
const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!);

async function s256(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** GitHub at the HTTP edge: it grants a token only for the code it issued and a verifier matching the challenge. */
function stubGitHub() {
  const github = { challenge: "", redirectUri: "" };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url === "https://github.com/login/oauth/access_token") {
      const body = new URLSearchParams(await request.text());
      const valid = body.get("code") === "issued-code"
        && body.get("redirect_uri") === github.redirectUri
        && await s256(body.get("code_verifier") ?? "") === github.challenge
        && request.headers.get("authorization") === `Basic ${btoa("fake-client-id:fake-client-secret")}`;
      return valid
        ? Response.json({ access_token: "gho_fake_token", token_type: "bearer", scope: "" })
        : Response.json({ error: "bad_verification_code" }, { status: 400 });
    }
    if (request.url === "https://api.github.com/user" && request.headers.get("authorization") === "Bearer gho_fake_token") {
      return Response.json(OCTOCAT);
    }
    return new Response(null, { status: 401 });
  });
  return github;
}

/** Start sign-in and let GitHub authorize it, as the reader's browser would. */
async function authorize(request: ReturnType<typeof site>, github: ReturnType<typeof stubGitHub>, returnTo: string) {
  const start = await request(`${AUTH}/start/github/?returnTo=${encodeURIComponent(returnTo)}`);
  const authorization = new URL(start.headers.get("location")!);
  github.challenge = authorization.searchParams.get("code_challenge")!;
  github.redirectUri = authorization.searchParams.get("redirect_uri")!;
  return { start, authorization, state: authorization.searchParams.get("state")!, flowCookies: cookiesFrom(start) };
}

afterEach(() => vi.unstubAllGlobals());

describe("signing in with GitHub", () => {
  it("returns the reader to their page signed in, and other plugins read who they are", async () => {
    const github = stubGitHub();
    const request = site();

    const { start, authorization, state, flowCookies } = await authorize(request, github, "/notes/garden/?view=all#reply");
    expect(start.status).toBe(302);
    expect(authorization.origin + authorization.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(authorization.searchParams.get("client_id")).toBe("fake-client-id");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(github.redirectUri).toBe(`${ORIGIN}${AUTH}/callback/github/`);
    expect(start.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-svartz-oauth=.+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/)]);

    const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: flowCookies });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/notes/garden/?view=all#reply");
    expect(callback.headers.getSetCookie()).toEqual([
      "__Host-svartz-oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      expect.stringMatching(/^__Host-svartz-session=.+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/),
    ]);
    const session = cookiesFrom(callback).filter((pair) => pair.startsWith("__Host-svartz-session="));

    const identity = {
      id: "github:583231",
      provider: "github",
      name: "The Octocat",
      handle: "octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      profileUrl: "https://github.com/octocat",
    };
    const me = await request(`${AUTH}/me/`, { cookies: session });
    expect(await me.json()).toEqual(identity);
    expect(await (await request("/notes/_svartz/greeter/", { cookies: session })).json()).toEqual({ signedIn: identity });

    const signOut = await request(`${AUTH}/sign-out/`, { cookies: session, method: "POST", origin: ORIGIN });
    expect(signOut.status).toBe(204);
    const afterSignOut = await request(`${AUTH}/me/`, { cookies: cookiesFrom(signOut) });
    expect(await afterSignOut.json()).toBeNull();
  });

  it("sends a reader who declines at GitHub back to their page, still signed out", async () => {
    const github = stubGitHub();
    const request = site();
    const { state, flowCookies } = await authorize(request, github, "/notes/garden/");

    const callback = await request(`${AUTH}/callback/github/?error=access_denied&state=${state}`, { cookies: flowCookies });

    expect(callback.headers.get("location")).toBe("/notes/garden/");
    expect(cookiesFrom(callback)).toEqual(["__Host-svartz-oauth="]);
  });

  it("gives up on a GitHub profile request that never answers, without signing the reader in", async () => {
    const github = stubGitHub();
    const answer = globalThis.fetch;
    // GitHub's API hangs. Only a request carrying a deadline ever settles, when that deadline fires.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      // Read the URL without wrapping a Request: that would consume the token request's body.
      const url = input instanceof Request ? input.url : String(input);
      if (url !== "https://api.github.com/user") return answer(input, init);
      return new Promise((_resolve, reject) => {
        if (init?.signal) reject(new DOMException("The operation timed out.", "TimeoutError"));
      });
    });
    const request = site();
    const { state, flowCookies } = await authorize(request, github, "/notes/");

    const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: flowCookies });

    expect(callback.status).toBe(502);
    expect(cookiesFrom(callback).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);
  });

  it("refuses a callback whose state doesn't match the sign-in this browser started", async () => {
    const github = stubGitHub();
    const request = site();
    const { flowCookies } = await authorize(request, github, "/notes/");

    const forged = await request(`${AUTH}/callback/github/?code=issued-code&state=forged`, { cookies: flowCookies });
    const noFlow = await request(`${AUTH}/callback/github/?code=issued-code&state=forged`);

    for (const response of [forged, noFlow]) {
      expect(response.status).toBe(400);
      expect(cookiesFrom(response).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);
    }
  });

  it.each([
    ["another origin", "https://evil.test/"],
    ["a protocol-relative URL", "//evil.test/"],
    ["a backslash the URL parser reads as a host", "/\\evil.test/"],
    ["a path that normalises to a protocol-relative URL", "/a/..//evil.test/"],
    ["a dot segment that normalises to a protocol-relative URL", "/.//evil.test"],
    ["a script URL", "javascript:alert(1)"],
  ])("refuses to return the reader to %s", async (_case, returnTo) => {
    const response = await site()(`${AUTH}/start/github/?returnTo=${encodeURIComponent(returnTo)}`);

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("auth configuration", () => {
  it("answers 503 naming PRIVATE_SVARTZ_SESSION_SECRET when it is missing", async () => {
    const response = await site({ PRIVATE_GITHUB_SECRET: "fake-client-secret" })(`${AUTH}/start/github/`);

    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("PRIVATE_SVARTZ_SESSION_SECRET");
  });

  it("answers 404 for a provider the vault doesn't list", async () => {
    expect((await site()(`${AUTH}/start/google/`)).status).toBe(404);
  });
});

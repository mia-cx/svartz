import { createServerHandle, type ServerHandler } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readIdentity, type ProviderId } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const ENV = {
  PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
  PRIVATE_GITHUB_SECRET: "fake-client-secret",
  PRIVATE_GOOGLE_SECRET: "fake-client-secret",
  PRIVATE_DISCORD_SECRET: "fake-client-secret",
  PRIVATE_X_SECRET: "fake-client-secret",
};
const ALL_PROVIDERS: ProviderId[] = ["github", "google", "discord", "x"];

/** Each provider at its HTTP edge: where it sends the reader, where it trades the code, and the profile it answers. */
const PROVIDERS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    scope: null,
    token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user",
    user: {
      id: 583231,
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/583231",
      html_url: "https://github.com/octocat",
    },
    identity: {
      id: "github:583231",
      provider: "github",
      name: "The Octocat",
      handle: "octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      profileUrl: "https://github.com/octocat",
    },
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    // OpenID Connect's name and picture, and no email address.
    scope: "openid profile",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    user: {
      sub: "110169484474386276334",
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
      picture: "https://lh3.googleusercontent.com/a/ada",
    },
    // Google accounts have no username or public profile page.
    identity: {
      id: "google:110169484474386276334",
      provider: "google",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
    },
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    scope: "identify",
    token: "https://discord.com/api/oauth2/token",
    userinfo: "https://discord.com/api/v10/users/@me",
    user: { id: "80351110224678912", username: "nelly", global_name: "Nelly", discriminator: "0", avatar: null },
    identity: {
      id: "discord:80351110224678912",
      provider: "discord",
      name: "Nelly",
      handle: "nelly",
      // No avatar of their own: Discord's default picture number (80351110224678912 >> 22) % 6 = 5.
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/5.png",
      profileUrl: "https://discord.com/users/80351110224678912",
    },
  },
  x: {
    authorize: "https://x.com/i/oauth2/authorize",
    // What `/2/users/me` requires, and nothing more.
    scope: "users.read tweet.read",
    token: "https://api.x.com/2/oauth2/token",
    userinfo: "https://api.x.com/2/users/me?user.fields=profile_image_url",
    user: {
      data: {
        id: "2244994945",
        name: "X Developers",
        username: "XDevelopers",
        profile_image_url: "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_normal.jpg",
      },
    },
    identity: {
      id: "x:2244994945",
      provider: "x",
      name: "X Developers",
      handle: "XDevelopers",
      avatarUrl: "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_normal.jpg",
      profileUrl: "https://x.com/XDevelopers",
    },
  },
} as const;

/** A vault mounted at /notes with the auth plugin and a plugin that greets whoever is signed in. */
function site(env: Record<string, string> = ENV, providers: ProviderId[] = ALL_PROVIDERS) {
  const greeter = (): ServerHandler => async (request, context) => Response.json({ signedIn: await readIdentity(request, context.env) });
  const apps = Object.fromEntries(providers.map((id) => [id, {
    clientId: "fake-client-id",
    clientSecret: { env: `PRIVATE_${id.toUpperCase()}_SECRET` },
  }]));
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      { id: "auth", load: () => import("../src/server"), options: { providers: apps } },
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

/** A provider that grants a token only for the code it issued and a verifier matching the challenge. */
function stubProvider(id: ProviderId) {
  const { token, userinfo, user } = PROVIDERS[id];
  const provider = { id, challenge: "", redirectUri: "" };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url === token) {
      const body = new URLSearchParams(await request.text());
      const valid = body.get("code") === "issued-code"
        && body.get("redirect_uri") === provider.redirectUri
        && await s256(body.get("code_verifier") ?? "") === provider.challenge
        && request.headers.get("authorization") === `Basic ${btoa("fake-client-id:fake-client-secret")}`;
      return valid
        ? Response.json({ access_token: "fake-access-token", token_type: "Bearer" })
        : Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    if (request.url === userinfo && request.headers.get("authorization") === "Bearer fake-access-token") {
      return Response.json(user);
    }
    return new Response(null, { status: 401 });
  });
  return provider;
}

/** Start sign-in and let the provider authorize it, as the reader's browser would. */
async function authorize(request: ReturnType<typeof site>, provider: ReturnType<typeof stubProvider>, returnTo: string) {
  const start = await request(`${AUTH}/start/${provider.id}/?returnTo=${encodeURIComponent(returnTo)}`);
  const authorization = new URL(start.headers.get("location")!);
  provider.challenge = authorization.searchParams.get("code_challenge")!;
  provider.redirectUri = authorization.searchParams.get("redirect_uri")!;
  return { start, authorization, state: authorization.searchParams.get("state")!, flowCookies: cookiesFrom(start) };
}

afterEach(() => vi.unstubAllGlobals());

describe.each(ALL_PROVIDERS)("signing in with %s", (id) => {
  it("returns the reader to their page signed in, and other plugins read who they are", async () => {
    const provider = stubProvider(id);
    const request = site();

    const { start, authorization, state, flowCookies } = await authorize(request, provider, "/notes/garden/?view=all#reply");
    expect(start.status).toBe(302);
    expect(authorization.origin + authorization.pathname).toBe(PROVIDERS[id].authorize);
    expect(authorization.searchParams.get("client_id")).toBe("fake-client-id");
    expect(authorization.searchParams.get("scope")).toBe(PROVIDERS[id].scope);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(provider.redirectUri).toBe(`${ORIGIN}${AUTH}/callback/${id}/`);
    expect(start.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-svartz-oauth=.+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/)]);

    const callback = await request(`${AUTH}/callback/${id}/?code=issued-code&state=${state}`, { cookies: flowCookies });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/notes/garden/?view=all#reply");
    expect(callback.headers.getSetCookie()).toEqual([
      "__Host-svartz-oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      expect.stringMatching(/^__Host-svartz-session=.+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/),
    ]);
    const session = cookiesFrom(callback).filter((pair) => pair.startsWith("__Host-svartz-session="));

    const me = await request(`${AUTH}/me/`, { cookies: session });
    expect(await me.json()).toEqual(PROVIDERS[id].identity);
    expect(await (await request("/notes/_svartz/greeter/", { cookies: session })).json()).toEqual({ signedIn: PROVIDERS[id].identity });

    const signOut = await request(`${AUTH}/sign-out/`, { cookies: session, method: "POST", origin: ORIGIN });
    expect(signOut.status).toBe(204);
    const afterSignOut = await request(`${AUTH}/me/`, { cookies: cookiesFrom(signOut) });
    expect(await afterSignOut.json()).toBeNull();
  });
});

describe("a sign-in that goes wrong", () => {
  it("sends a reader who declines at the provider back to their page, still signed out", async () => {
    const github = stubProvider("github");
    const request = site();
    const { state, flowCookies } = await authorize(request, github, "/notes/garden/");

    const callback = await request(`${AUTH}/callback/github/?error=access_denied&state=${state}`, { cookies: flowCookies });

    expect(callback.headers.get("location")).toBe("/notes/garden/");
    expect(cookiesFrom(callback)).toEqual(["__Host-svartz-oauth="]);
  });

  it.each(ALL_PROVIDERS)("gives up when %s's profile request never answers, without signing the reader in", async (id) => {
    const provider = stubProvider(id);
    const answer = globalThis.fetch;
    // The profile API hangs. Only a request carrying a deadline ever settles, when that deadline fires.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      // Read the URL without wrapping a Request: that would consume the token request's body.
      const url = input instanceof Request ? input.url : String(input);
      if (url !== PROVIDERS[id].userinfo) return answer(input, init);
      return new Promise((_resolve, reject) => {
        if (init?.signal) reject(new DOMException("The operation timed out.", "TimeoutError"));
      });
    });
    const request = site();
    const { state, flowCookies } = await authorize(request, provider, "/notes/");

    const callback = await request(`${AUTH}/callback/${id}/?code=issued-code&state=${state}`, { cookies: flowCookies });

    expect(callback.status).toBe(502);
    expect(cookiesFrom(callback).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);
  });

  it("refuses a callback whose state doesn't match the sign-in this browser started", async () => {
    const github = stubProvider("github");
    const request = site();
    const { flowCookies } = await authorize(request, github, "/notes/");

    const forged = await request(`${AUTH}/callback/github/?code=issued-code&state=forged`, { cookies: flowCookies });
    const noFlow = await request(`${AUTH}/callback/github/?code=issued-code&state=forged`);

    for (const response of [forged, noFlow]) {
      expect(response.status).toBe(400);
      expect(cookiesFrom(response).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);
    }
  });

  it.each([["github", "discord"], ["x", "github"]] as const)("refuses a sign-in started with %s that calls back at %s's route", async (started, returned) => {
    const provider = stubProvider(started);
    const request = site();
    const { state, flowCookies } = await authorize(request, provider, "/notes/");

    const callback = await request(`${AUTH}/callback/${returned}/?code=issued-code&state=${state}`, { cookies: flowCookies });

    expect(callback.status).toBe(400);
    expect(cookiesFrom(callback).some((pair) => pair.startsWith("__Host-svartz-session="))).toBe(false);
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
    expect((await site(ENV, ["github"])(`${AUTH}/start/google/`)).status).toBe(404);
  });
});

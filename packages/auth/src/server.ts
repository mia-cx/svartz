/**
 * The `auth` server plugin and the library other server plugins use to read who is signed in.
 *
 * Routes, under `<mount>/_svartz/auth/`:
 * - `GET start/<provider>/?returnTo=<path>` redirects to the provider, holding state and the PKCE verifier in a
 *   10-minute sealed cookie.
 * - `GET callback/<provider>/` checks them, reads the profile, seals the identity into a 30-day session cookie and
 *   returns the reader to `returnTo`. Provider tokens are dropped here.
 * - `GET me/` answers the identity, or `null`.
 * - `POST sign-out/` clears the session.
 */
import { CodeChallengeMethod, generateCodeVerifier, generateState, OAuth2Client } from "arctic";
import type { EnvReference, ServerContext, ServerModuleFactory } from "@svartz/core";
import { isProviderId, PROVIDERS, type Identity, type ProviderId } from "./providers";
import { seal, SESSION_SECRET_ENV, SESSION_SECRET_MIN_LENGTH, sessionSecret, unseal } from "./seal";

export type { Identity, ProviderId } from "./providers";

/** One provider's OAuth app. The secret is named by environment variable, never inlined. */
export interface ProviderOptions {
  readonly clientId: string;
  readonly clientSecret: EnvReference;
}

/** The `auth` plugin's options. */
export interface AuthOptions {
  /** The providers readers may sign in with, in the order the sign-in dialog lists them. Others answer 404. */
  readonly providers: { readonly [Id in ProviderId]?: ProviderOptions };
  /** URL of the site's privacy notice; the sign-in dialog links to it. */
  readonly privacyNotice?: string;
}

// `__Host-` binds each cookie to this origin with `Path=/` and `Secure`, so no subdomain can set or read it.
const SESSION_COOKIE = "__Host-svartz-session";
const FLOW_COOKIE = "__Host-svartz-oauth";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const FLOW_MAX_AGE = 10 * 60;

type Env = Readonly<Record<string, unknown>>;
type Flow = { provider: ProviderId; state: string; verifier: string; returnTo: string };

function readCookie(request: Request, name: string): string | undefined {
  for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  return ["id", "name", "handle", "avatarUrl", "profileUrl"].every((key) => typeof identity[key] === "string")
    && typeof identity.provider === "string" && isProviderId(identity.provider);
}

function isFlow(value: unknown): value is Flow {
  if (!value || typeof value !== "object") return false;
  const flow = value as Record<string, unknown>;
  return ["provider", "state", "verifier", "returnTo"].every((key) => typeof flow[key] === "string");
}

/**
 * Who sent `request`, from its session cookie, or `null` when nobody is signed in.
 * `env` is the handler's `context.env`. Without a usable `PRIVATE_SVARTZ_SESSION_SECRET` nobody can be signed in, so this
 * answers `null`; the auth routes report the missing secret with a 503.
 */
export async function readIdentity(request: Request, env: Env): Promise<Identity | null> {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const value = await unseal(readCookie(request, SESSION_COOKIE), secret, "session");
  return isIdentity(value) ? value : null;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function failure(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return json({ error, message }, status, headers);
}

function redirect(location: string, cookies: readonly string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status: 302, headers });
}

/** The site root this plugin's vault is mounted at: `context.base` without `/_svartz/auth`. */
function siteRoot(context: ServerContext): string {
  return `${context.base.replace(/\/_svartz\/[^/]+$/, "")}/`;
}

/** A same-origin path, normalised; `undefined` for anything that would leave the site. */
function sameOriginPath(candidate: string, url: URL): string | undefined {
  // Only paths: a scheme or `//host` is refused before parsing, and parsing catches `/\host` and friends.
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return undefined;
  const target = new URL(candidate, url.origin);
  // Dot segments can normalise `/a/..//evil.test/` into a path that reads as `//host` once relative again.
  if (target.origin !== url.origin || target.pathname.startsWith("//")) return undefined;
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Every provider returns to this vault's callback. */
function callbackUrl(url: URL, context: ServerContext, provider: ProviderId): string {
  return `${url.origin}${context.base}/callback/${provider}/`;
}

/** One sign-in step for a configured provider. */
interface Step {
  readonly request: Request;
  readonly url: URL;
  readonly context: ServerContext;
  readonly provider: ProviderId;
  readonly client: OAuth2Client;
  readonly secret: string;
}

async function start({ url, context, provider, client, secret }: Step): Promise<Response> {
  const returnTo = sameOriginPath(url.searchParams.get("returnTo") ?? siteRoot(context), url);
  if (!returnTo) return failure(400, "invalid_return_to", "returnTo must be a path on this site.");
  const { authorizationEndpoint, scopes } = PROVIDERS[provider];
  const state = generateState();
  const verifier = generateCodeVerifier();
  const location = client.createAuthorizationURLWithPKCE(authorizationEndpoint, state, CodeChallengeMethod.S256, verifier, [...scopes]);
  const flow = await seal({ provider, state, verifier, returnTo } satisfies Flow, secret, "oauth", FLOW_MAX_AGE);
  return redirect(location.href, [cookie(FLOW_COOKIE, flow, FLOW_MAX_AGE)]);
}

async function callback({ request, url, provider, client, secret }: Step): Promise<Response> {
  const flow = await unseal(readCookie(request, FLOW_COOKIE), secret, "oauth");
  const clearFlow = cookie(FLOW_COOKIE, "", 0);
  if (!isFlow(flow) || flow.provider !== provider || flow.state !== url.searchParams.get("state")) {
    return failure(400, "invalid_state", "This sign-in expired or began in another browser. Sign in again.",
      { "set-cookie": clearFlow });
  }
  // The reader declined at the provider: back where they were, still signed out.
  if (url.searchParams.has("error")) return redirect(flow.returnTo, [clearFlow]);
  const code = url.searchParams.get("code");
  if (!code) return failure(400, "invalid_request", "The provider sent no authorization code.", { "set-cookie": clearFlow });

  const { label, tokenEndpoint, profile } = PROVIDERS[provider];
  let identity: Identity;
  try {
    const tokens = await client.validateAuthorizationCode(tokenEndpoint, code, flow.verifier);
    identity = await profile(tokens.accessToken());
  } catch (error) {
    console.error(`[svartz:auth] ${label} sign-in failed`, error);
    return failure(502, "provider_failed", `${label} didn't confirm the sign-in. Sign in again.`, { "set-cookie": clearFlow });
  }
  const session = await seal(identity, secret, "session", SESSION_MAX_AGE);
  return redirect(flow.returnTo, [clearFlow, cookie(SESSION_COOKIE, session, SESSION_MAX_AGE)]);
}

function signOut(request: Request, url: URL): Response {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return failure(403, "cross_origin", "Sign out from this site.");
  return new Response(null, { status: 204, headers: { "set-cookie": cookie(SESSION_COOKIE, "", 0) } });
}

const ROUTE = /^\/(?:(start|callback)\/([^/]+)|(me)|(sign-out))\/$/;

/** The `auth` server module: `server: { module, options }` with {@link AuthOptions}. */
const authServer: ServerModuleFactory<AuthOptions> = (options) => async (request, context) => {
  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname.slice(context.base.length));
  if (!match) return undefined;
  const [, step, providerName = "", me] = match;
  const provider = isProviderId(providerName) ? providerName : undefined;
  const app = provider && options.providers[provider];
  if (step && !app) return undefined;

  const method = step || me ? "GET" : "POST";
  if (request.method !== method) return failure(405, "method_not_allowed", `Use ${method}.`, { allow: method });

  const secret = sessionSecret(context.env);
  if (!secret) {
    return failure(503, "misconfigured",
      `Set ${SESSION_SECRET_ENV} to a random value of at least ${SESSION_SECRET_MIN_LENGTH} characters.`);
  }
  if (me) return json(await readIdentity(request, context.env));
  if (!provider || !app) return signOut(request, url);

  const clientSecret = context.env[app.clientSecret.env];
  if (typeof clientSecret !== "string" || !clientSecret) {
    return failure(503, "misconfigured", `Set ${app.clientSecret.env} to the ${PROVIDERS[provider].label} OAuth app's client secret.`);
  }
  const client = new OAuth2Client(app.clientId, clientSecret, callbackUrl(url, context, provider));
  const args: Step = { request, url, context, provider, client, secret };
  return step === "start" ? start(args) : callback(args);
};

export default authServer;

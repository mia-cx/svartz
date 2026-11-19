/**
 * Who sent a request: the session cookie, opened and looked up in D1. Server plugins read it with
 * {@link readAccount}, {@link readSignIn} or, until they move to accounts, {@link readIdentity}.
 */
import { isProviderId, type Identity } from "./providers";
import { seal, sessionSecret, unseal } from "./seal";
import { accountsDatabase, boundDatabase, deleteSession, digest, forgetLegacyCookie, legacySession, migrate, readSession, SESSION_MAX_AGE_SECONDS } from "./store";

type Env = Readonly<Record<string, unknown>>;

// `__Host-` binds the cookie to this origin with `Path=/` and `Secure`, so no subdomain can set or read it.
export const SESSION_COOKIE = "__Host-svartz-session";

/** The role bootstrap admins hold. */
export const ADMIN_ROLE = "admin";

/** A person on the site: one account, however many providers they sign in with. */
export interface Account {
  /** Stable and opaque; never shown. */
  readonly id: string;
  /** Unique across the site, chosen on first sign-in: lowercase letters, digits, `-` and `_`. */
  readonly handle: string;
  /** Display name, from the provider at first sign-in. */
  readonly name: string;
  readonly avatarUrl?: string;
  /** ISO 8601. */
  readonly createdAt: string;
  /** Roles the account holds. `admin` for every account linked to an identity in the `auth` plugin's `admins`. */
  readonly roles: readonly string[];
  /** The provider account this session signed in with. */
  readonly identity: Identity;
}

/** Why {@link readSignIn} found no account. */
export type SignedOutReason =
  /** No session cookie, or one that is tampered, expired, deleted from D1 or signed out. */
  | "signed-out"
  /** Nothing is bound as `SVARTZ_DB`, so the site has no accounts; sign-in still works, identity only. */
  | "no-database";

/** The signed-in account, or `null` and the reason there is none. */
export type SignIn =
  | { readonly account: Account; readonly reason?: undefined }
  | { readonly account: null; readonly reason: SignedOutReason };

/** What the session cookie holds since accounts: a session id, looked up in D1 on every read. */
interface SessionCookie {
  readonly sid: string;
}

/** The deployed config's bootstrap admins, once an `auth` plugin has started in this isolate. */
let configuredAdmins: readonly string[] | undefined;

/** Called by the `auth` server module as it starts: from then on, `admins` decides who is an admin. */
export function useAdmins(admins: readonly string[]): void {
  configuredAdmins = admins;
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

export function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  return ["id", "name"].every((key) => typeof identity[key] === "string")
    && ["handle", "avatarUrl", "profileUrl"].every((key) => identity[key] === undefined || typeof identity[key] === "string")
    && typeof identity.provider === "string" && isProviderId(identity.provider);
}

const isSessionCookie = (value: unknown): value is SessionCookie =>
  typeof value === "object" && value !== null && typeof (value as SessionCookie).sid === "string";

/** The session cookie's value for session `sid`. */
export const sealSession = (sid: string, secret: string): Promise<string> =>
  seal({ sid } satisfies SessionCookie, secret, "session", SESSION_MAX_AGE_SECONDS);

/** The request's session cookie: raw, and opened. `undefined` when there is none or it doesn't open. */
async function sessionCookie(request: Request, env: Env): Promise<{ raw: string; value: SessionCookie | Identity } | undefined> {
  const secret = sessionSecret(env);
  const raw = readCookie(request, SESSION_COOKIE);
  if (!secret || !raw) return undefined;
  const value = await unseal(raw, secret, "session");
  return isSessionCookie(value) || isIdentity(value) ? { raw, value } : undefined;
}

interface Reader {
  readonly signIn: SignIn;
  /** Without accounts, the identity a cookie from before accounts holds. */
  readonly identity: Identity | null;
}

const SIGNED_OUT: Reader = { signIn: { account: null, reason: "signed-out" }, identity: null };

async function read(request: Request, env: Env): Promise<Reader> {
  const cookie = await sessionCookie(request, env);
  const db = boundDatabase(env);
  if (!db) {
    // Without accounts, sign-in seals the identity itself, as it did before accounts existed.
    const identity = cookie && isIdentity(cookie.value) ? cookie.value : null;
    return { signIn: { account: null, reason: "no-database" }, identity };
  }
  // Signed-out readers never touch the database.
  if (!cookie) return SIGNED_OUT;
  await migrate(db);
  const sid = isSessionCookie(cookie.value) ? cookie.value.sid : await legacySession(db, await digest(cookie.raw), cookie.value);
  const session = sid === undefined ? undefined : await readSession(db, sid);
  if (!session) return SIGNED_OUT;
  const admins = configuredAdmins ?? session.storedAdmins ?? [];
  const account: Account = {
    ...session.account,
    roles: session.linkedIdentities.some((id) => admins.includes(id)) ? [ADMIN_ROLE] : [],
    identity: session.identity,
  };
  return { signIn: { account }, identity: account.identity };
}

/**
 * The account behind `request`, or `null` and why: signed out, or no accounts database bound. `env` is the handler's
 * `context.env`. A cookie from before accounts becomes an account and a session on its first read here.
 */
export async function readSignIn(request: Request, env: Env): Promise<SignIn> {
  return (await read(request, env)).signIn;
}

/**
 * The account behind `request`, or `null` when nobody is signed in, the session was deleted or expired, or the site
 * binds no `SVARTZ_DB`. {@link readSignIn} says which.
 */
export async function readAccount(request: Request, env: Env): Promise<Account | null> {
  return (await read(request, env)).signIn.account;
}

/**
 * Who sent `request`: the provider account they signed in with, or `null` when nobody is signed in.
 * `env` is the handler's `context.env`. Without a usable `PRIVATE_SVARTZ_SESSION_SECRET` nobody can be signed in, so this
 * answers `null`; the auth routes report the missing secret with a 503. Plugins that need a person rather than a
 * provider account use {@link readAccount}.
 */
export async function readIdentity(request: Request, env: Env): Promise<Identity | null> {
  return (await read(request, env)).identity;
}

/** End the request's session in D1, so its cookie reads as signed out everywhere, even where the browser kept a copy. */
export async function endSession(request: Request, env: Env): Promise<void> {
  const cookie = await sessionCookie(request, env);
  const db = cookie && await accountsDatabase(env);
  if (!cookie || !db) return;
  if (isSessionCookie(cookie.value)) await deleteSession(db, cookie.value.sid);
  else await forgetLegacyCookie(db, await digest(cookie.raw));
}

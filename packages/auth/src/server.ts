/**
 * The `auth` server plugin and the library other server plugins use to read who is signed in, and to check what they
 * may do with `can()`.
 *
 * Routes, under `<mount>/_svartz/auth/`:
 * - `GET start/<provider>/?returnTo=<path>` redirects to the provider, holding state and the PKCE verifier in a
 *   10-minute sealed cookie.
 * - `GET callback/<provider>/` checks them and reads the profile; provider tokens are dropped here. A provider account
 *   linked to an account gets a 30-day session and returns to `returnTo`; a new one goes to `handle/` first.
 * - `GET handle/` asks a first-time reader for a handle; `POST handle/` creates their account and session.
 * - `GET me/` answers the identity, or `null`.
 * - `POST sign-out/` ends the session; with `?returnTo=<path>`, as a form posts it, it redirects there.
 * - `POST account/profile/`, `account/unlink/`, `account/sign-out-everywhere/` and `account/link/<provider>/` change the
 *   signed-in account and redirect back to its `/-/account/` page, which this module also renders.
 * - `GET users/<handle>/` answers a public profile and reputation score, redirecting an old handle to the current one.
 * - `GET reputation/?page=<path>` answers the reputation of the account whose user page is at `path`, for that page.
 * - `GET viewer/` answers the signed-in handle and whether the dashboard has a panel for them, for the site's links, or
 *   that the account is suspended.
 * - `POST people/…` changes grants and roles from the dashboard's People & permissions panel (`people-panel.ts`).
 * - `POST groups/…` creates groups, manages their members and links them to objects (`groups-routes.ts`).
 * - `POST reputation/…` sets reputation's points and thresholds, and gives kudos (`reputation-panel.ts`).
 *
 * Pages: `/-/account/`, each group's `/-/groups/<name>/`, and `/-/dashboard/`, which lists every plugin's panels the
 * viewer may open (`dashboard.ts`).
 *
 * Accounts and sessions live in the D1 database bound as `SVARTZ_DB`; without one, the session cookie holds the
 * identity itself and nobody has an account. On a vault whose `callbackVault` is another vault, `start` forwards to
 * that vault's, and `callback`, `handle`, `account/profile` and `account/link` answer 404: the callback vault holds the
 * user pages, so it alone allocates handles.
 */
import { CodeChallengeMethod, generateCodeVerifier, generateState, OAuth2Client } from "arctic";
import {
  decodeRoutePath, type EnvReference, type PageRenderer, type PermissionDeclaration, type ServerContext, type ServerHandler,
  type ServerModuleFactory,
} from "@svartz/core";
import { accountPage, displayName, signedOutPage, suspendedPage, type AccountView, type StatusCode } from "./account";
import { AUTH_PERMISSIONS } from "./auth-permissions";
import { chooserPage, expiredPage } from "./chooser";
import { DASHBOARD_PAGE, dashboardPage, openableSections } from "./dashboard";
import { usePermissions } from "./grants";
import { accountGroups, groupsPage, groupsPanel, groupsRoute } from "./groups-routes";
import { peoplePanel, peopleRoute } from "./people-panel";
import { personByHandle } from "./people";
import { handleScore, standingOf, type Standing } from "./reputation";
import { kudosPanel, reputationPanel, reputationRoute } from "./reputation-panel";
import { handleFrom, HANDLE_PROBLEM, isHandle, typedHandle } from "./handle";
import { isProviderId, PROVIDERS, type Identity, type ProviderId } from "./providers";
import { seal, SESSION_SECRET_ENV, SESSION_SECRET_MIN_LENGTH, sessionSecret, unseal } from "./seal";
import {
  endSession, isIdentity, readAccount, readCookie, readCurrentSession, readIdentity, readSignIn, sealSession, SESSION_COOKIE, useAdmins,
} from "./session";
import {
  ACCOUNTS_DATABASE_ENV, accountsDatabase, createAccount, endAccountSessions, handlesOf, hasAccount, linkIdentity,
  profileByHandle, profilesByHandle, profilesById, SESSION_MAX_AGE_SECONDS, signInsOf, startSession, suggestHandle, unlinkIdentity,
  updateProfile, type Database, type PublicProfile,
} from "./store";
import { builtUserPages, DEFAULT_USER_PAGE_FOLDER, hasUserPage, useUserPages, userPageLocation, type UserPages } from "./user-pages";

export type { Identity, ProviderId } from "./providers";
export type { Account, SignIn, SignedOutReason } from "./session";
export type { PublicProfile } from "./store";
export { ADMIN_ROLE, readAccount, readIdentity, readSignIn } from "./session";
export { ACCOUNTS_DATABASE_ENV };
export { can, canEach, migrateGrants, type IdentityGrant } from "./grants";
export type { PermissionTarget } from "./permissions";
export { audit, auditIfChanged, readAuditLog, type AuditEntry, type AuditLogPage, type AuditQuery, type AuditRecord } from "./audit";
export {
  findSuspension, liftSuspension, listSuspensions, LIFT_ACTION, suspend, SUSPEND_ACTION, type LiftResult, type SuspendedAccount,
  type SuspendResult, type Suspension, type SuspensionSubject,
} from "./suspensions";
export { linkedIdentities } from "./identities";
export { userPageLocation, type UserPageLocation } from "./user-pages";
export { postReputation, reverseReputation, type Recipient, type ReputationEvent, type Reversal, type Standing, type Threshold } from "./reputation";

/**
 * The public profile of the account that holds or held `handle`, under its current handle; `undefined` when no account
 * ever held it or the site binds no `SVARTZ_DB`. A result whose `handle` differs from the one asked for means the
 * asked one is old: redirect to the current one. Old handles never pass to another account.
 */
export async function findProfile(handle: string, env: Readonly<Record<string, unknown>>): Promise<PublicProfile | undefined> {
  const db = await accountsDatabase(env);
  return db && profileByHandle(db, handle);
}

/**
 * The public profile of the account provider account `identity` (such as `github:583231`) is linked to, for a plugin
 * that stored who wrote something by their sign-in; `undefined` when no account has it or the site binds no `SVARTZ_DB`.
 */
export async function findProfileByIdentity(identity: string, env: Readonly<Record<string, unknown>>): Promise<PublicProfile | undefined> {
  return (await findProfilesByIdentity([identity], env)).get(identity);
}

/** {@link findProfileByIdentity} for each of `identities` in one D1 call, by identity; identities no account has are absent. */
export async function findProfilesByIdentity(identities: readonly string[], env: Readonly<Record<string, unknown>>): Promise<Map<string, PublicProfile>> {
  const db = await accountsDatabase(env);
  if (!db || identities.length === 0) return new Map();
  const { results } = await db.prepare(`SELECT i.id, a.handle, a.name, a.avatar_url FROM auth_identities i JOIN auth_accounts a ON a.id = i.account_id
    WHERE i.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(identities))
    .all<{ id: string; handle: string; name: string; avatar_url: string | null }>();
  return new Map(results.map((row) => [row.id, { handle: row.handle, name: row.name, ...row.avatar_url !== null && { avatarUrl: row.avatar_url } }]));
}

/**
 * {@link findProfile} for each of `handles` in one D1 call, by the handle asked for; handles no account ever held are
 * absent, and so is every one when the site binds no `SVARTZ_DB`.
 */
export async function findProfilesByHandle(handles: readonly string[], env: Readonly<Record<string, unknown>>): Promise<Map<string, PublicProfile>> {
  const db = await accountsDatabase(env);
  return db ? profilesByHandle(db, handles) : new Map();
}

/**
 * The public profiles of the accounts with ids `ids`, by id, for plugins that stored an account id, such as a commit's
 * `Svartz-Account` trailer. Ids no account has are absent, and so is every id when the site binds no `SVARTZ_DB`.
 */
export async function findProfiles(ids: readonly string[], env: Readonly<Record<string, unknown>>): Promise<Map<string, PublicProfile>> {
  const db = await accountsDatabase(env);
  return db ? profilesById(db, ids) : new Map();
}

/**
 * The URL, below the deployment base, of the user page at `handle`; `undefined` while there is none, for a hidden
 * one, and until the vault that holds user pages has started.
 */
export function userPageOf(handle: string): string | undefined {
  const pages = builtUserPages();
  return pages && hasUserPage(pages, handle) ? pages[handle] ?? undefined : undefined;
}

/** An account as a page about it shows it: who it is, its user page and its reputation. */
export interface AccountStanding extends PublicProfile {
  /** The account's id, as {@link Account} and plugins' records name it. Never show it. */
  readonly id: string;
  /** Its user page's URL below the deployment base, under any handle it has held, as {@link userPageOf} answers. */
  readonly userPage?: string;
  /** Its score, and the next threshold whose role it doesn't hold. Show `next` only to the account itself. */
  readonly standing: Standing;
}

/**
 * The account that holds or held `handle`, under its current handle, with its user page and reputation; `undefined`
 * when no account ever held it or the site binds no `SVARTZ_DB`.
 */
export async function findStanding(handle: string, env: Readonly<Record<string, unknown>>): Promise<AccountStanding | undefined> {
  const db = await accountsDatabase(env);
  const { results: [row] } = db
    ? await db.prepare(`SELECT a.id, a.handle, a.name, a.avatar_url FROM auth_handles h JOIN auth_accounts a ON a.id = h.account_id
      WHERE h.handle = ?`).bind(handle).all<{ id: string; handle: string; name: string; avatar_url: string | null }>()
    : { results: [] };
  if (!db || !row) return undefined;
  const [handles, standing] = await Promise.all([handlesOf(db, row.id), standingOf(db, row.id)]);
  const pages = builtUserPages();
  // As the account page finds it: the current handle's page, else the one a handle change left behind.
  const owned = pages && [row.handle, ...handles].find((held) => hasUserPage(pages, held));
  const userPage = owned === undefined ? undefined : userPageOf(owned);
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    ...row.avatar_url !== null && { avatarUrl: row.avatar_url },
    ...userPage && { userPage },
    standing,
  };
}

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
  /**
   * The id of the host vault whose routes run every sign-in in this app, so each provider needs one callback URL.
   * Default: the first host vault that enables auth. It must list every provider this vault does.
   */
  readonly callbackVault?: string;
  /**
   * Identity ids, such as `"github:583231"`, whose accounts always hold the `admin` role. The role comes from this list,
   * not from the database, so nothing stored there can take it away.
   */
  readonly admins?: readonly string[];
  /**
   * The folder of user pages, as page slugs spell it. `<folder>/<handle>` in the vault that runs sign-in is the page of
   * the account with that handle, which it may always edit. Default: `"users"`. Host vaults share accounts, so they
   * must set the same one.
   */
  readonly userPages?: string;
}

/** What the server module receives: the options, plus where sign-in runs when another vault runs it. */
export interface AuthServerOptions extends AuthOptions {
  /** The callback vault's mount path; absent when this vault runs its own sign-ins. */
  readonly callbackMountPath?: string;
  /** Every permission the config's plugins declare, across the vaults that share accounts, collected at config resolution. */
  readonly permissions?: readonly PermissionDeclaration[];
  /** The ids of the vaults that share these accounts, for the dashboard's object picker. Default: this vault alone. */
  readonly vaults?: readonly string[];
  /**
   * The id of the vault that holds user pages: the one that runs sign-in, set at config resolution. Without it, no
   * page is a user page.
   */
  readonly userPageVault?: string;
}

/** What the plugin's build hook records for the server module. */
export interface AuthServerData {
  /** Every permission the vault's final plugins declare, a theme preset's included, collected as the build runs. */
  readonly permissions: readonly PermissionDeclaration[];
  /** The vault's published folders (ending in `/`) and pages, which the dashboard's object picker suggests. */
  readonly paths?: readonly string[];
  /** The user pages the build found, recorded only on the vault that holds user pages. */
  readonly userPages?: UserPages;
}

const FLOW_COOKIE = "__Host-svartz-oauth";
const PENDING_COOKIE = "__Host-svartz-pending";
const FLOW_MAX_AGE = 10 * 60;
/** How long a first-time reader has to choose a handle. */
const PENDING_MAX_AGE = 15 * 60;

/** An OAuth round trip in progress. `link` is the session that asked to link a provider, when it isn't a sign-in. */
type Flow = { provider: ProviderId; state: string; verifier: string; returnTo: string; link?: string };
/** A verified first sign-in, waiting for its handle. */
type Pending = { identity: Identity; returnTo: string };

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function isFlow(value: unknown): value is Flow {
  if (!value || typeof value !== "object") return false;
  const flow = value as Record<string, unknown>;
  return ["provider", "state", "verifier", "returnTo"].every((key) => typeof flow[key] === "string")
    && (flow.link === undefined || typeof flow.link === "string");
}

function isPending(value: unknown): value is Pending {
  if (!value || typeof value !== "object") return false;
  const pending = value as Record<string, unknown>;
  return isIdentity(pending.identity) && typeof pending.returnTo === "string";
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function failure(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return json({ error, message }, status, headers);
}

/** 302 after a GET; 303 after a form POST, so the browser follows with a GET; 308 for an address that moved for good. */
function redirect(location: string, cookies: readonly string[], status: 302 | 303 | 308 = 302): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, { status, headers });
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

/** The deployment base, which page URLs from the build are below: `context.base` without the mount and plugin. */
function deploymentBase(context: ServerContext): string {
  const plugin = context.base.slice(context.base.lastIndexOf("/_svartz/"));
  return context.base.slice(0, context.base.length - context.vault.mountPath.length - plugin.length);
}

/** `context.base` for the same plugin on the vault mounted at `mountPath`. */
function baseAt(context: ServerContext, mountPath: string): string {
  return `${deploymentBase(context)}${mountPath}${context.base.slice(context.base.lastIndexOf("/_svartz/"))}`;
}

/** Every provider returns to this vault's callback. */
function callbackUrl(url: URL, context: ServerContext, provider: ProviderId): string {
  return `${url.origin}${context.base}/callback/${provider}/`;
}

/** A form POST from another site, or none at all; browsers name the page's origin on every POST. */
const crossOrigin = (request: Request, url: URL): boolean => {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== url.origin;
};

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

async function callback({ request, url, context, provider, client, secret }: Step): Promise<Response> {
  const flow = await unseal(readCookie(request, FLOW_COOKIE), secret, "oauth");
  const clearFlow = cookie(FLOW_COOKIE, "", 0);
  if (!isFlow(flow) || flow.provider !== provider || flow.state !== url.searchParams.get("state")) {
    return failure(400, "invalid_state", "This sign-in expired or began in another browser. Sign in again.",
      { "set-cookie": clearFlow });
  }
  // The reader declined at the provider: back where they were, with any existing session untouched.
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
    if (flow.link !== undefined) return redirect(withStatus(flow.returnTo, url, "link-failed", provider), [clearFlow]);
    return failure(502, "provider_failed", `${label} didn't confirm the sign-in. Sign in again.`, { "set-cookie": clearFlow });
  }

  const db = await accountsDatabase(context.env);
  if (flow.link !== undefined) {
    if (!db) return failure(503, "misconfigured", `Bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to give readers accounts.`, { "set-cookie": clearFlow });
    // Only the session that asked may receive the link: a signed-out, switched or forged browser gets nothing.
    const current = await readCurrentSession(request, context.env);
    if (current?.sid !== flow.link) return redirect(withStatus(flow.returnTo, url, "link-expired"), [clearFlow]);
    const linked = await linkIdentity(db, current.account.id, identity);
    return redirect(withStatus(flow.returnTo, url, linked === "linked" ? "linked" : "linked-elsewhere", provider), [clearFlow]);
  }
  // Without accounts, the cookie holds the identity itself.
  if (!db) return redirect(flow.returnTo, [clearFlow, cookie(SESSION_COOKIE, await seal(identity, secret, "session", SESSION_MAX_AGE_SECONDS), SESSION_MAX_AGE_SECONDS)]);
  const sid = await startSession(db, identity);
  if (sid) return redirect(flow.returnTo, [clearFlow, cookie(SESSION_COOKIE, await sealSession(sid, secret), SESSION_MAX_AGE_SECONDS)]);
  const pending = await seal({ identity, returnTo: flow.returnTo } satisfies Pending, secret, "pending", PENDING_MAX_AGE);
  return redirect(`${context.base}/handle/`, [clearFlow, cookie(PENDING_COOKIE, pending, PENDING_MAX_AGE)]);
}

/**
 * The handle chooser for a first sign-in waiting in the pending cookie, and the account it creates. `pages` are the
 * user pages this vault's build found, whose handles are taken.
 */
async function chooseHandle(request: Request, url: URL, context: ServerContext, secret: string, db: Database, pages: UserPages): Promise<Response> {
  const pending = await unseal(readCookie(request, PENDING_COOKIE), secret, "pending");
  if (!isPending(pending)) return expiredPage(siteRoot(context));
  const { identity, returnTo } = pending;
  // Spent: this first sign-in already made its account, here or in a racing submit. Its cookie starts no session, so
  // a saved copy can't sign back in after a sign-out; the reader goes back, signed in if the first answer reached them.
  const spent = () => redirect(returnTo, [cookie(PENDING_COOKIE, "", 0)], request.method === "GET" ? 302 : 303);
  if (await hasAccount(db, identity.id)) return spent();
  const show = (handle: string, error?: string) => chooserPage({
    siteTitle: typeof context.vault.site.title === "string" ? context.vault.site.title : url.host,
    providerLabel: PROVIDERS[identity.provider].label,
    identity,
    handle,
    error,
    action: `${context.base}/handle/`,
    cancel: returnTo,
  });
  if (request.method === "GET") return show(await suggestHandle(db, handleFrom(identity.handle ?? identity.name), pages));

  if (crossOrigin(request, url)) return failure(403, "cross_origin", "Choose your handle on this site.");
  const form = await request.formData().catch(() => undefined);
  const handle = typedHandle(String(form?.get("handle") ?? ""));
  if (!isHandle(handle)) return show(handle, HANDLE_PROBLEM);
  // A user page nobody holds the handle of would become this account's.
  const sid = hasUserPage(pages, handle) ? "taken" : await createAccount(db, identity, handle);
  if (sid === "linked") return spent();
  if (sid === "taken") {
    const free = await suggestHandle(db, handle, pages);
    return show(free, `@${handle} is taken. @${free} is free, or try another.`);
  }
  return redirect(returnTo, [cookie(PENDING_COOKIE, "", 0), cookie(SESSION_COOKIE, await sealSession(sid, secret), SESSION_MAX_AGE_SECONDS)], 303);
}

/** End the session: 204 for a script, or for a form that names a same-site `returnTo`, a redirect there. */
async function signOut(request: Request, url: URL, context: ServerContext): Promise<Response> {
  if (crossOrigin(request, url)) return failure(403, "cross_origin", "Sign out from this site.");
  const returnTo = url.searchParams.get("returnTo");
  const back = returnTo === null ? undefined : sameOriginPath(returnTo, url);
  if (returnTo !== null && !back) return failure(400, "invalid_return_to", "returnTo must be a path on this site.");
  await endSession(request, context.env);
  const cleared = cookie(SESSION_COOKIE, "", 0);
  return back ? redirect(back, [cleared], 303) : new Response(null, { status: 204, headers: { "set-cookie": cleared } });
}

/** The account page of the vault at `context`: `<base><mount>/-/account/`. */
const accountPagePath = (context: ServerContext): string => `${siteRoot(context)}-/account/`;

/**
 * What the account page at `context` shows of the reader's user page, from `pages`, the user page vault's build: a link
 * to the page under the current handle, else under one held before, where a handle change left it. While there is
 * none, room for a plugin to start it, on the vault that holds user pages only, so a page is never started where it
 * isn't one. Nothing for a hidden page, which the site never links, or before the user page vault has started.
 */
function userPageView(pages: UserPages | undefined, current: string, handles: readonly string[], context: ServerContext): AccountView["userPage"] {
  if (!pages) return undefined;
  const owned = [current, ...handles].find((handle) => hasUserPage(pages, handle));
  if (owned !== undefined) {
    const href = pages[owned];
    return href ? { href: `${deploymentBase(context)}${href}` } : undefined;
  }
  const { vault, folder } = userPageLocation();
  return vault === context.vault.id ? { missing: `${folder}/${current}` } : undefined;
}

/**
 * `GET reputation/?page=<path>`: for the user page at `path` (below the deployment base), its owner's current handle
 * and score, and to the owner alone the next threshold too; `null` for any other page.
 */
async function userPageStanding(request: Request, url: URL, context: ServerContext, pages: UserPages | undefined): Promise<Response> {
  const page = url.searchParams.get("page");
  const handle = pages && page ? Object.keys(pages).find((candidate) => pages[candidate] === page) : undefined;
  const db = handle === undefined ? undefined : await accountsDatabase(context.env);
  const owner = db && handle !== undefined ? await personByHandle(db, handle) : undefined;
  if (!db || !owner) return json(null);
  const [{ score, next }, viewer] = await Promise.all([standingOf(db, owner.id), readAccount(request, context.env)]);
  return json({ handle: owner.handle, score, ...viewer?.id === owner.id && next && { next } });
}

/** `path` with the account page's `status` query, and the provider or typed values it concerns. */
function withStatus(path: string, url: URL, status: StatusCode, provider?: ProviderId, typed: Record<string, string> = {}): string {
  const target = new URL(path, url.origin);
  target.searchParams.set("status", status);
  if (provider) target.searchParams.set("provider", provider);
  for (const [key, value] of Object.entries(typed)) target.searchParams.set(key, value);
  return `${target.pathname}${target.search}`;
}

/** What an account form needs: the request, the signed-in session and the database. */
interface AccountChange {
  readonly request: Request;
  readonly url: URL;
  readonly context: ServerContext;
  readonly db: Database;
  readonly session: NonNullable<Awaited<ReturnType<typeof readCurrentSession>>>;
}

/**
 * Change the display name and handle, then go back to `returnTo`, the account page the form was on, which may be
 * another vault's. `pages` are the user pages this vault's build found.
 */
async function changeProfile({ request, url, context, db, session }: AccountChange, pages: UserPages): Promise<Response> {
  const form = await request.formData().catch(() => undefined);
  const typedName = String(form?.get("name") ?? "");
  const handle = typedHandle(String(form?.get("handle") ?? ""));
  const page = sameOriginPath(url.searchParams.get("returnTo") ?? accountPagePath(context), url) ?? accountPagePath(context);
  const back = (status: StatusCode) => redirect(withStatus(page, url, status, undefined,
    status === "saved" ? {} : { name: typedName, handle }), [], 303);
  const name = displayName(typedName);
  if (!name) return back("name-invalid");
  if (!isHandle(handle)) return back("handle-invalid");
  // A user page is its owner's whatever their handle: a handle with a page the account never held isn't free to take.
  if (hasUserPage(pages, handle) && !(await handlesOf(db, session.account.id)).includes(handle)) return back("handle-taken");
  return back(await updateProfile(db, session.account.id, { name, handle }) === "saved" ? "saved" : "handle-taken");
}

async function unlink({ request, url, context, db, session }: AccountChange): Promise<Response> {
  const form = await request.formData().catch(() => undefined);
  const identity = String(form?.get("identity") ?? "");
  const [provider] = identity.split(":", 1);
  const back = (status: StatusCode) =>
    redirect(withStatus(accountPagePath(context), url, status, isProviderId(provider ?? "") ? provider as ProviderId : undefined), [], 303);
  // Unlinking this browser's own sign-in would sign it out mid-click; sign in another way first.
  if (identity === session.account.identity.id) return back("unlink-current");
  return back(await unlinkIdentity(db, session.account.id, identity) ? "unlinked" : "unlink-last");
}

async function signOutEverywhere({ context, db, session }: AccountChange): Promise<Response> {
  await endAccountSessions(db, session.account.id);
  return redirect(accountPagePath(context), [cookie(SESSION_COOKIE, "", 0)], 303);
}

/** Start linking `provider` to the signed-in account: the provider calls back here, bound to this session. */
async function startLink(change: AccountChange, provider: ProviderId, client: OAuth2Client, secret: string): Promise<Response> {
  const { url, context, session } = change;
  const returnTo = sameOriginPath(url.searchParams.get("returnTo") ?? accountPagePath(context), url);
  if (!returnTo) return failure(400, "invalid_return_to", "returnTo must be a path on this site.");
  const { authorizationEndpoint, scopes } = PROVIDERS[provider];
  const state = generateState();
  const verifier = generateCodeVerifier();
  const location = client.createAuthorizationURLWithPKCE(authorizationEndpoint, state, CodeChallengeMethod.S256, verifier, [...scopes]);
  const flow = await seal({ provider, state, verifier, returnTo, link: session.sid } satisfies Flow, secret, "oauth", FLOW_MAX_AGE);
  return redirect(location.href, [cookie(FLOW_COOKIE, flow, FLOW_MAX_AGE)], 303);
}

/**
 * `GET users/<handle>/`: the public profile and the account's reputation score, with an old handle redirected to the
 * current one.
 */
async function userProfile(handle: string, context: ServerContext): Promise<Response | undefined> {
  const db = await accountsDatabase(context.env);
  const profile = db && await profileByHandle(db, handle);
  if (!profile) return undefined;
  if (profile.handle !== handle) return redirect(`${context.base}/users/${profile.handle}/`, [], 308);
  return json({ ...profile, reputation: await handleScore(db, handle) });
}

/**
 * `GET viewer/`: who the sign-in links name, and whether the dashboard has a panel for them: `{ handle, dashboard }`;
 * `{ suspended: true }` for a suspended account, whose account page says why; `null` when nobody is signed in to an
 * account.
 */
async function viewer(request: Request, context: ServerContext): Promise<Response> {
  const { account, reason } = await readSignIn(request, context.env);
  if (reason === "suspended") return json({ suspended: true });
  if (!account) return json(null);
  return json({ handle: account.handle, dashboard: (await openableSections(account, context)).length > 0 });
}

const ROUTE = /^\/(?:(start|callback)\/([^/]+)|(me)|(sign-out)|(handle))\/$/;
const ACCOUNT_ROUTE = /^\/account\/(?:(profile|unlink|sign-out-everywhere)|link\/([^/]+))\/$/;
const USER_ROUTE = /^\/users\/([^/]+)\/$/;

/** The `auth` server module: `server: { module, options, pages: ["account", "dashboard", "groups"] }` with {@link AuthOptions}. */
const authServer: ServerModuleFactory<AuthServerOptions, AuthServerData | undefined> = (options, data) => {
  // The plugin is eager, so this runs before the site answers anything: every account read resolves `admin` from
  // this deployment's config, and every `can()` its permission catalogue.
  useAdmins(options.admins ?? []);
  usePermissions([...AUTH_PERMISSIONS, ...options.permissions ?? [], ...data?.permissions ?? []]);
  // User pages live in the vault that runs sign-in, and only its build records them. Its routes alone allocate
  // handles, against `pages`, so what they reserve never depends on which vault a request reached first.
  const runsSignIn = options.callbackMountPath === undefined;
  const pages: UserPages = data?.userPages ?? {};
  useUserPages({ vault: options.userPageVault, folder: options.userPages ?? DEFAULT_USER_PAGE_FOLDER }, runsSignIn ? pages : undefined);
  const providers = Object.keys(options.providers).filter(isProviderId);
  /** The OAuth client for a configured provider, or the response explaining why there is none. */
  const clientFor = (provider: ProviderId, url: URL, context: ServerContext): OAuth2Client | Response => {
    const app = options.providers[provider]!;
    const clientSecret = context.env[app.clientSecret.env];
    if (typeof clientSecret !== "string" || !clientSecret) {
      return failure(503, "misconfigured", `Set ${app.clientSecret.env} to the ${PROVIDERS[provider].label} OAuth app's client secret.`);
    }
    return new OAuth2Client(app.clientId, clientSecret, callbackUrl(url, context, provider));
  };

  const accountRoute = async (request: Request, url: URL, context: ServerContext, action: string | undefined, linkTo: string | undefined): Promise<Response | undefined> => {
    const provider = linkTo !== undefined && isProviderId(linkTo) && options.providers[linkTo] ? linkTo : undefined;
    if (linkTo !== undefined && !provider) return undefined;
    // Providers only call back to the callback vault, so only it starts a link; it holds the user pages, so only it
    // changes a handle.
    if ((provider || action === "profile") && !runsSignIn) return undefined;
    if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
    // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
    if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Change your account on this site.");
    const secret = sessionSecret(context.env);
    if (!secret) {
      return failure(503, "misconfigured", `Set ${SESSION_SECRET_ENV} to a random value of at least ${SESSION_SECRET_MIN_LENGTH} characters.`);
    }
    const db = await accountsDatabase(context.env);
    if (!db) return failure(503, "misconfigured", `Bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to give readers accounts.`);
    const session = await readCurrentSession(request, context.env);
    if (!session) return redirect(accountPagePath(context), [], 303);
    const change: AccountChange = { request, url, context, db, session };
    if (provider) {
      const client = clientFor(provider, url, context);
      return client instanceof Response ? client : startLink(change, provider, client, secret);
    }
    if (action === "profile") return changeProfile(change, pages);
    if (action === "unlink") return unlink(change);
    return signOutEverywhere(change);
  };

  const vaultsOf = (context: ServerContext): readonly string[] => options.vaults ?? [context.vault.id];

  const page: PageRenderer = async (request, context) => {
    if (context.path.startsWith(`${DASHBOARD_PAGE}/`)) return dashboardPage(request, context, await readAccount(request, context.env));
    if (context.path.startsWith("groups/")) return groupsPage(request, context);
    if (context.path !== "account/") return undefined;
    // Without accounts, or without the secret that opens sessions, there is no account to show.
    const db = await accountsDatabase(context.env);
    if (!db || !sessionSecret(context.env)) return undefined;
    const url = new URL(request.url);
    const here = url.pathname;
    const session = await readCurrentSession(request, context.env);
    if (!session) {
      const signIn = await readSignIn(request, context.env);
      if (signIn.reason === "suspended") return suspendedPage(signIn.suspension, `${context.base}/sign-out/?returnTo=${encodeURIComponent(here)}`);
      return signedOutPage(providers, (provider) => `${context.base}/start/${provider}/?returnTo=${encodeURIComponent(here)}`);
    }
    const linkBase = options.callbackMountPath === undefined ? context.base : baseAt(context, options.callbackMountPath);
    const [{ identities, sessions }, handles, standing] = await Promise.all([
      signInsOf(db, session.account.id), handlesOf(db, session.account.id), standingOf(db, session.account.id),
    ]);
    // Another vault's module registered its user pages as it started: every page request passes each host vault first.
    const userPage = userPageView(runsSignIn ? pages : builtUserPages(), session.account.handle, handles, context);
    return accountPage({
      account: session.account,
      standing,
      identities,
      sessions,
      session: session.sid,
      userPage,
      providers,
      query: url.searchParams,
      groups: await accountGroups(db, session.account, context, url.searchParams),
      actions: {
        profile: `${linkBase}/account/profile/?returnTo=${encodeURIComponent(here)}`,
        unlink: `${context.base}/account/unlink/`,
        signOutEverywhere: `${context.base}/account/sign-out-everywhere/`,
        link: (provider) => `${linkBase}/account/link/${provider}/?returnTo=${encodeURIComponent(here)}`,
      },
    });
  };

  const handle: ServerHandler = async (request, context) => {
    const url = new URL(request.url);
    const path = url.pathname.slice(context.base.length);
    const account = ACCOUNT_ROUTE.exec(path);
    if (account) return accountRoute(request, url, context, account[1], account[2]);
    if (path === "/viewer/") {
      return request.method === "GET" ? viewer(request, context) : failure(405, "method_not_allowed", "Use GET.", { allow: "GET" });
    }
    if (path === "/reputation/") {
      if (request.method !== "GET") return failure(405, "method_not_allowed", "Use GET.", { allow: "GET" });
      return userPageStanding(request, url, context, runsSignIn ? pages : builtUserPages());
    }
    const changed = await peopleRoute(request, path, context, vaultsOf(context))
      ?? await groupsRoute(request, path, context, vaultsOf(context))
      ?? await reputationRoute(request, path, context);
    if (changed) return changed;
    const user = USER_ROUTE.exec(path);
    if (user) {
      if (request.method !== "GET") return failure(405, "method_not_allowed", "Use GET.", { allow: "GET" });
      const handle = decodeRoutePath(user[1]!);
      return handle === undefined ? undefined : userProfile(handle, context);
    }
    const match = ROUTE.exec(path);
    if (!match) return undefined;
    const [, step, providerName = "", me, , handle] = match;
    const provider = isProviderId(providerName) ? providerName : undefined;
    const app = provider && options.providers[provider];
    if (step && !app) return undefined;

    const methods = handle ? ["GET", "POST"] : step || me ? ["GET"] : ["POST"];
    if (!methods.includes(request.method)) {
      return failure(405, "method_not_allowed", `Use ${methods.join(" or ")}.`, { allow: methods.join(", ") });
    }

    // Another vault runs sign-in: providers only know its callback, so start there and come back here.
    const { callbackMountPath } = options;
    if ((step || handle) && callbackMountPath !== undefined) {
      if (step !== "start") return undefined;
      const returnTo = url.searchParams.get("returnTo") ?? siteRoot(context);
      const location = `${baseAt(context, callbackMountPath)}/start/${provider}/?returnTo=${encodeURIComponent(returnTo)}`;
      return redirect(location, []);
    }

    const secret = sessionSecret(context.env);
    if (!secret) {
      return failure(503, "misconfigured",
        `Set ${SESSION_SECRET_ENV} to a random value of at least ${SESSION_SECRET_MIN_LENGTH} characters.`);
    }
    if (me) return json(await readIdentity(request, context.env));
    if (handle) {
      const db = await accountsDatabase(context.env);
      if (!db) return failure(503, "misconfigured", `Bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to give readers accounts.`);
      return chooseHandle(request, url, context, secret, db, pages);
    }
    if (!provider || !app) return signOut(request, url, context);

    const client = clientFor(provider, url, context);
    if (client instanceof Response) return client;
    const args: Step = { request, url, context, provider, client, secret };
    return step === "start" ? start(args) : callback(args);
  };

  return {
    handle,
    page,
    dashboard: {
      title: "Accounts",
      panels: [peoplePanel({ vaults: vaultsOf, paths: data?.paths ?? [] }), groupsPanel({ vaults: vaultsOf, paths: data?.paths ?? [] }), reputationPanel, kudosPanel],
    },
  };
};

export default authServer;

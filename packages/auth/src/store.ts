/**
 * Accounts, their linked sign-ins and their sessions, in D1. Auth owns its schema: {@link migrate} brings any database
 * up to date on first use. Every table starts with `auth_`, so the site can keep other plugins' tables in the same
 * database.
 */
import { handleFrom, numbered } from "./handle";
import type { Identity } from "./providers";

/**
 * The D1 binding accounts live in. A fixed name, like `PRIVATE_SVARTZ_SESSION_SECRET`, because every server plugin
 * reads accounts with only `(request, env)` in hand.
 */
export const ACCOUNTS_DATABASE_ENV = "SVARTZ_DB";

/** The slice of Cloudflare's `D1Database` this store uses. */
export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<Array<{ results: unknown[] }>>;
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<unknown>;
}

/** How long a session lasts from sign-in. It doesn't slide: after 30 days the reader signs in again. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MS_PER_SECOND = 1000;
const SESSION_ID_BYTES = 32;
/** Tries at an automatic handle before giving up, when racing sign-ins keep taking the one suggested. */
const HANDLE_ATTEMPTS = 5;

const MIGRATIONS_TABLE = "svartz_auth_migrations";

/**
 * Each entry is one schema version, applied in order and recorded in {@link MIGRATIONS_TABLE}. Append new versions;
 * never edit an applied one. Two first requests can race to apply the same version, so statements must be safe to
 * run twice (`IF NOT EXISTS`) wherever SQLite allows.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL
    )`,
    // A provider account (`github:583231`) linked to one account, with the profile it last signed in with.
    `CREATE TABLE IF NOT EXISTS auth_identities (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts (id),
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      handle TEXT,
      avatar_url TEXT,
      profile_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS auth_identities_by_account ON auth_identities (account_id)`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts (id),
      identity_id TEXT NOT NULL REFERENCES auth_identities (id),
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS auth_sessions_by_account ON auth_sessions (account_id)`,
    `CREATE INDEX IF NOT EXISTS auth_sessions_by_expiry ON auth_sessions (expires_at)`,
    // Cookies from before accounts, by SHA-256, and the session each became. A signed-out or revoked one keeps its row
    // with no session, so the old cookie can never become a session again.
    `CREATE TABLE IF NOT EXISTS auth_legacy_cookies (
      hash TEXT PRIMARY KEY,
      session_id TEXT,
      created_at TEXT NOT NULL
    )`,
  ],
  [
    // Grants, `(actor, object, permission) → value`, as `permissions.ts` describes them. The key leads with what `can()`
    // looks up: one permission on the objects of one chain. A stored `unset` overrides a declared default.
    `CREATE TABLE IF NOT EXISTS auth_grants (
      actor_type TEXT NOT NULL CHECK (actor_type IN ('account', 'group', 'role', 'static')),
      actor_id TEXT NOT NULL,
      object TEXT NOT NULL,
      permission TEXT NOT NULL,
      value TEXT NOT NULL CHECK (value IN ('allow', 'deny', 'unset')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (permission, object, actor_type, actor_id)
    )`,
    // Grants a plugin moved from its config onto an identity's account, so each lands once: a later change to the
    // grant, its removal included, is never undone by the config still listing the identity.
    `CREATE TABLE IF NOT EXISTS auth_grant_migrations (
      identity_id TEXT NOT NULL,
      object TEXT NOT NULL,
      permission TEXT NOT NULL,
      migrated_at TEXT NOT NULL,
      PRIMARY KEY (identity_id, object, permission)
    )`,
  ],
  [
    // Every handle an account has held, its current one included. An old handle stays with its account for good: it
    // points at the account's current handle, and no other account can take it.
    `CREATE TABLE IF NOT EXISTS auth_handles (
      handle TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES auth_accounts (id),
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS auth_handles_by_account ON auth_handles (account_id)`,
    `INSERT OR IGNORE INTO auth_handles (handle, account_id, created_at) SELECT handle, id, created_at FROM auth_accounts`,
    // Provider accounts linked to an account when it signed out everywhere. A cookie from before accounts holds one of
    // them; never read, it had no session for that sign-out to end, so it becomes no session afterwards. A row outlives
    // its link, so moving the provider account to another account doesn't revive the cookie.
    `CREATE TABLE IF NOT EXISTS auth_signed_out_identities (
      identity_id TEXT PRIMARY KEY,
      signed_out_at TEXT NOT NULL
    )`,
  ],
];

const migrated = new WeakMap<Database, Promise<void>>();

/** Apply every schema version `db` lacks, once per binding per isolate. A failed attempt is retried next time. */
export function migrate(db: Database): Promise<void> {
  let ready = migrated.get(db);
  if (!ready) {
    ready = applyMigrations(db);
    ready.catch(() => migrated.delete(db));
    migrated.set(db, ready);
  }
  return ready;
}

async function applyMigrations(db: Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`).run();
  const { results } = await db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`).all<{ version: number }>();
  const applied = new Set(results.map(({ version }) => version));
  for (const [index, statements] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (applied.has(version)) continue;
    // One batch is one transaction: a version applies whole or not at all.
    await db.batch([
      ...statements.map((statement) => db.prepare(statement)),
      db.prepare(`INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (version, applied_at) VALUES (?, ?)`).bind(version, new Date().toISOString()),
    ]);
  }
}

function isDatabase(value: unknown): value is Database {
  return typeof value === "object" && value !== null && typeof (value as Database).prepare === "function"
    && typeof (value as Database).batch === "function";
}

/** The accounts database bound in `env`, not yet migrated, or `undefined` when none is bound. */
export function boundDatabase(env: Readonly<Record<string, unknown>>): Database | undefined {
  const db = env[ACCOUNTS_DATABASE_ENV];
  return isDatabase(db) ? db : undefined;
}

/** The accounts database bound in `env`, migrated, or `undefined` when none is bound. */
export async function accountsDatabase(env: Readonly<Record<string, unknown>>): Promise<Database | undefined> {
  const db = boundDatabase(env);
  if (db) await migrate(db);
  return db;
}

/** An account's own row, as {@link readSession} answers it. */
export interface AccountRecord {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly createdAt: string;
}

/** A live session: its account, the sign-in it used and every identity linked to the account. */
export interface SessionRecord {
  readonly account: AccountRecord;
  readonly identity: Identity;
  readonly linkedIdentities: readonly string[];
}

interface SessionRow {
  account_id: string;
  account_handle: string;
  account_name: string;
  account_avatar_url: string | null;
  account_created_at: string;
  identity_id: string;
  provider: Identity["provider"];
  name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_url: string | null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

const newSessionId = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTES)));

/** The SHA-256 of `text`, base64url: how a cookie from before accounts is recorded without keeping it. */
export async function digest(text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

/**
 * Session `id` with its account and sign-in, or `undefined` when it was deleted or has expired, or its provider account
 * no longer belongs to its account. A sign-in looks the account up before inserting the session, so an unlink and a
 * link elsewhere in between can leave a session whose sign-in is now another account's; it never reads.
 */
export async function readSession(db: Database, id: string): Promise<SessionRecord | undefined> {
  const [sessions, identities] = await db.batch([
    db.prepare(`SELECT a.id AS account_id, a.handle AS account_handle, a.name AS account_name,
        a.avatar_url AS account_avatar_url, a.created_at AS account_created_at,
        i.id AS identity_id, i.provider, i.name, i.handle, i.avatar_url, i.profile_url
      FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id
        JOIN auth_identities i ON i.id = s.identity_id AND i.account_id = s.account_id
      WHERE s.id = ? AND s.expires_at > ?`).bind(id, Date.now()),
    db.prepare(`SELECT i.id FROM auth_sessions s JOIN auth_identities i ON i.account_id = s.account_id WHERE s.id = ?`).bind(id),
  ]);
  const row = sessions!.results[0] as SessionRow | undefined;
  if (!row) return undefined;
  return {
    account: {
      id: row.account_id,
      handle: row.account_handle,
      name: row.account_name,
      ...row.account_avatar_url !== null && { avatarUrl: row.account_avatar_url },
      createdAt: row.account_created_at,
    },
    identity: {
      id: row.identity_id,
      provider: row.provider,
      name: row.name,
      ...row.handle !== null && { handle: row.handle },
      ...row.avatar_url !== null && { avatarUrl: row.avatar_url },
      ...row.profile_url !== null && { profileUrl: row.profile_url },
    },
    linkedIdentities: (identities!.results as { id: string }[]).map(({ id }) => id),
  };
}

/** Delete session `id`; that browser reads as signed out on its next request. */
export async function deleteSession(db: Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(id).run();
}

/** A new session for `identity` on `account`, sweeping expired ones in the same batch. */
function insertSession(db: Database, id: string, account: string, identity: string, at: string): Statement[] {
  const now = Date.parse(at);
  return [
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    db.prepare(`INSERT INTO auth_sessions (id, account_id, identity_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, account, identity, at, now + SESSION_MAX_AGE_SECONDS * MS_PER_SECOND),
  ];
}

/** Refresh a linked identity's profile with what the provider says now. */
function refreshIdentity(db: Database, identity: Identity, at: string): Statement {
  return db.prepare(`UPDATE auth_identities SET provider = ?2, name = ?3, handle = ?4, avatar_url = ?5, profile_url = ?6,
      updated_at = ?7 WHERE id = ?1`)
    .bind(identity.id, identity.provider, identity.name, identity.handle ?? null, identity.avatarUrl ?? null,
      identity.profileUrl ?? null, at);
}

/** The account `identity` is linked to, if any. */
async function linkedAccount(db: Database, identity: string): Promise<string | undefined> {
  const { results: [row] } = await db.prepare("SELECT account_id FROM auth_identities WHERE id = ?").bind(identity)
    .all<{ account_id: string }>();
  return row?.account_id;
}

/**
 * Start a session for `identity` when it is linked to an account, refreshing its profile, and answer the session id.
 * `undefined` when no account has it yet: the reader chooses a handle first.
 */
export async function startSession(db: Database, identity: Identity): Promise<string | undefined> {
  const account = await linkedAccount(db, identity.id);
  if (!account) return undefined;
  const id = newSessionId();
  const at = new Date().toISOString();
  await db.batch([refreshIdentity(db, identity, at), ...insertSession(db, id, account, identity.id, at)]);
  return id;
}

/** Whether a provider account is linked to an account yet. */
export async function hasAccount(db: Database, identity: string): Promise<boolean> {
  return await linkedAccount(db, identity) !== undefined;
}

/**
 * Create an account with `handle` for `identity`, link it, and start a session, all in one batch; answer the session
 * id. Creating nothing, it answers `"linked"` when a racing sign-in linked `identity` first, so one first sign-in
 * starts one session, and `"taken"` when another account has `handle`.
 */
export async function createAccount(db: Database, identity: Identity, handle: string): Promise<string | "taken" | "linked"> {
  const account = crypto.randomUUID();
  const id = newSessionId();
  const at = new Date().toISOString();
  try {
    await db.batch([...insertAccount(db, account, identity, handle, at), ...insertSession(db, id, account, identity.id, at)]);
    return id;
  } catch (error) {
    // The batch is one transaction, so nothing landed. Which unique key refused it decides what the reader sees.
    if (await hasAccount(db, identity.id)) return "linked";
    if (await isTaken(db, handle)) return "taken";
    throw error;
  }
}

/** Whether any account holds `handle`, now or before: old handles stay with their account. */
async function isTaken(db: Database, handle: string): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_handles WHERE handle = ?").bind(handle).all();
  return results.length > 0;
}

/** The first free handle among `base`, `base-2`, `base-3` and so on. */
export async function suggestHandle(db: Database, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await isTaken(db, candidate); n++) candidate = numbered(base, n);
  return candidate;
}

/** Insert a new account with `handle` and link `identity` to it. */
function insertAccount(db: Database, account: string, identity: Identity, handle: string, at: string): Statement[] {
  return [
    db.prepare("INSERT INTO auth_accounts (id, handle, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(account, handle, identity.name, identity.avatarUrl ?? null, at),
    db.prepare("INSERT INTO auth_handles (handle, account_id, created_at) VALUES (?, ?, ?)").bind(handle, account, at),
    db.prepare(`INSERT INTO auth_identities (id, account_id, provider, name, handle, avatar_url, profile_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(identity.id, account, identity.provider, identity.name, identity.handle ?? null, identity.avatarUrl ?? null,
        identity.profileUrl ?? null, at, at),
  ];
}

/**
 * The session a cookie from before accounts stands for, by the cookie's hash. The first read creates it, and the
 * account too when `identity` has none, with the closest free handle to the provider's, so nobody is asked anything
 * and nobody is signed out. Racing first reads agree on one session. `undefined` once that session was signed out or
 * deleted: the old cookie never becomes a session again.
 */
export async function legacySession(db: Database, hash: string, identity: Identity): Promise<string | undefined> {
  for (let attempt = 1; ; attempt++) {
    const { results: [known] } = await db.prepare("SELECT session_id FROM auth_legacy_cookies WHERE hash = ?").bind(hash)
      .all<{ session_id: string | null }>();
    if (known) return known.session_id ?? undefined;

    const at = new Date().toISOString();
    const session = newSessionId();
    const linked = await linkedAccount(db, identity.id);
    const account = linked ?? crypto.randomUUID();
    const create = linked ? [] : insertAccount(db, account, identity, await suggestHandle(db, handleFrom(identity.handle ?? identity.name)), at);
    try {
      await db.batch([
        ...create,
        // The first read to record the cookie wins. A racing read inserts no session and finds the winner's next time round.
        // Every such cookie predates any sign-out everywhere, so it records no session once its provider account was
        // signed out, whichever account holds that provider account now.
        db.prepare(`INSERT OR IGNORE INTO auth_legacy_cookies (hash, session_id, created_at)
          SELECT ?1, CASE WHEN EXISTS (SELECT 1 FROM auth_signed_out_identities WHERE identity_id = ?4) THEN NULL ELSE ?2 END, ?3`)
          .bind(hash, session, at, identity.id),
        db.prepare(`INSERT INTO auth_sessions (id, account_id, identity_id, created_at, expires_at)
          SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM auth_legacy_cookies WHERE hash = ?6 AND session_id = ?1)`)
          .bind(session, account, identity.id, at, Date.parse(at) + SESSION_MAX_AGE_SECONDS * MS_PER_SECOND, hash),
      ]);
    } catch (error) {
      // A racing read linked the identity, or took the suggested handle, first: look again.
      if (attempt === HANDLE_ATTEMPTS) throw error;
    }
  }
}

/** A provider account linked to an account, as the account page lists it. */
export interface LinkedIdentity extends Identity {
  /** ISO 8601. */
  readonly linkedAt: string;
}

/** A live session of an account, as the account page lists it. */
export interface SessionSummary {
  readonly id: string;
  /** The provider account it signed in with. */
  readonly identity: string;
  readonly provider: Identity["provider"];
  /** ISO 8601. */
  readonly createdAt: string;
}

interface IdentityRow {
  id: string;
  provider: Identity["provider"];
  name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  created_at: string;
}

/** The account's linked provider accounts, oldest first, and its live sessions, newest first. */
export async function signInsOf(db: Database, account: string): Promise<{ identities: LinkedIdentity[]; sessions: SessionSummary[] }> {
  const [identities, sessions] = await db.batch([
    db.prepare(`SELECT id, provider, name, handle, avatar_url, profile_url, created_at FROM auth_identities
      WHERE account_id = ? ORDER BY created_at, id`).bind(account),
    db.prepare(`SELECT s.id, s.identity_id, i.provider, s.created_at FROM auth_sessions s
      JOIN auth_identities i ON i.id = s.identity_id AND i.account_id = s.account_id
      WHERE s.account_id = ? AND s.expires_at > ? ORDER BY s.created_at DESC, s.id`)
      .bind(account, Date.now()),
  ]);
  return {
    identities: (identities!.results as IdentityRow[]).map((row) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      ...row.handle !== null && { handle: row.handle },
      ...row.avatar_url !== null && { avatarUrl: row.avatar_url },
      ...row.profile_url !== null && { profileUrl: row.profile_url },
      linkedAt: row.created_at,
    })),
    sessions: (sessions!.results as { id: string; identity_id: string; provider: Identity["provider"]; created_at: string }[])
      .map((row) => ({ id: row.id, identity: row.identity_id, provider: row.provider, createdAt: row.created_at })),
  };
}

/**
 * Link `identity` to `account`, or refresh its profile when it already is. `"elsewhere"`, changing nothing, when
 * another account has it: one provider account reaches one person.
 */
export async function linkIdentity(db: Database, account: string, identity: Identity): Promise<"linked" | "elsewhere"> {
  const owner = await linkedAccount(db, identity.id);
  if (owner !== undefined && owner !== account) return "elsewhere";
  const at = new Date().toISOString();
  if (owner === account) {
    await refreshIdentity(db, identity, at).run();
    return "linked";
  }
  try {
    await db.prepare(`INSERT INTO auth_identities (id, account_id, provider, name, handle, avatar_url, profile_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(identity.id, account, identity.provider, identity.name, identity.handle ?? null, identity.avatarUrl ?? null,
        identity.profileUrl ?? null, at, at)
      .run();
    return "linked";
  } catch (error) {
    // A racing link or first sign-in took it first.
    const winner = await linkedAccount(db, identity.id);
    if (winner === undefined) throw error;
    return winner === account ? "linked" : "elsewhere";
  }
}

/**
 * Unlink provider account `identity` from `account`, ending the sessions it signed in. Answers `false`, changing
 * nothing, when it is the account's last: the guard and both deletes run as one transaction, so racing unlinks can't
 * leave an account nobody can sign in to.
 */
export async function unlinkIdentity(db: Database, account: string, identity: string): Promise<boolean> {
  const others = "(SELECT COUNT(*) FROM auth_identities WHERE account_id = ?2) > 1";
  await db.batch([
    db.prepare(`DELETE FROM auth_sessions WHERE identity_id = ?1 AND account_id = ?2 AND ${others}`).bind(identity, account),
    db.prepare(`DELETE FROM auth_identities WHERE id = ?1 AND account_id = ?2 AND ${others}`).bind(identity, account),
  ]);
  const { results } = await db.prepare("SELECT 1 FROM auth_identities WHERE id = ? AND account_id = ?").bind(identity, account).all();
  return results.length === 0;
}

/**
 * End every session of `account`, so each of its browsers reads as signed out on its next request. A browser still
 * holding a cookie from before accounts that was never read has no session yet; recording each provider account
 * linked now keeps {@link legacySession} from starting one, even after the provider account moves to another account.
 */
export async function endAccountSessions(db: Database, account: string): Promise<void> {
  const at = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE account_id = ?").bind(account),
    db.prepare(`INSERT INTO auth_signed_out_identities (identity_id, signed_out_at)
      SELECT id, ?2 FROM auth_identities WHERE account_id = ?1
      ON CONFLICT (identity_id) DO UPDATE SET signed_out_at = excluded.signed_out_at`).bind(account, at),
  ]);
}

/**
 * Set `account`'s display name and handle in one transaction. A new handle joins the account's handles, so the old one
 * keeps pointing here; `"taken"`, changing nothing, when another account holds or held it.
 */
export async function updateProfile(db: Database, account: string, { name, handle }: { name: string; handle: string }): Promise<"saved" | "taken"> {
  try {
    await db.batch([
      // Nothing to add when the account held this handle before; a handle another account holds fails the key.
      db.prepare(`INSERT INTO auth_handles (handle, account_id, created_at)
        SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM auth_handles WHERE handle = ?1 AND account_id = ?2)`)
        .bind(handle, account, new Date().toISOString()),
      db.prepare("UPDATE auth_accounts SET handle = ?, name = ? WHERE id = ?").bind(handle, name, account),
    ]);
    return "saved";
  } catch (error) {
    if (await isTaken(db, handle)) return "taken";
    throw error;
  }
}

/** A person's public profile, as their handle reaches it. */
export interface PublicProfile {
  /** The current handle, which differs from the one asked for when that one is old. */
  readonly handle: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

/** The account that holds or held `handle`, by its current handle; `undefined` when no account ever held it. */
export async function profileByHandle(db: Database, handle: string): Promise<PublicProfile | undefined> {
  const { results: [row] } = await db.prepare(`SELECT a.handle, a.name, a.avatar_url FROM auth_handles h
    JOIN auth_accounts a ON a.id = h.account_id WHERE h.handle = ?`).bind(handle)
    .all<{ handle: string; name: string; avatar_url: string | null }>();
  return row && { handle: row.handle, name: row.name, ...row.avatar_url !== null && { avatarUrl: row.avatar_url } };
}

/** Sign a cookie from before accounts out for good: its session goes, and the cookie can't start another. */
export async function forgetLegacyCookie(db: Database, hash: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE id = (SELECT session_id FROM auth_legacy_cookies WHERE hash = ?)").bind(hash),
    db.prepare(`INSERT INTO auth_legacy_cookies (hash, session_id, created_at) VALUES (?, NULL, ?)
      ON CONFLICT (hash) DO UPDATE SET session_id = NULL`).bind(hash, new Date().toISOString()),
  ]);
}

/**
 * Suspensions: a moderator takes an account's rights away for a while, or for good. Auth keeps them in
 * `auth_suspensions` and enforces them where it reads the session (`session.ts`): while one is in force, the account's
 * sessions read as `{ account: null, reason: "suspended" }`, so it is a guest on every plugin. Its sessions stay, and
 * it is signed in again once the suspension's time passes; nothing sweeps or schedules.
 *
 * These calls change and read suspensions; the caller decides who may (the moderation plugin checks
 * `moderation:accounts:write`). Each change commits in one batch with its audit entry.
 */
import { auditIfChanged, auditStatement } from "./audit";
import { ADMIN_ROLE, heldRoles, type Account } from "./session";
import { accountsDatabase, ACCOUNTS_DATABASE_ENV, inForce, suspensionOf, type Database, type Suspension, type SuspensionRow } from "./store";

export type { Suspension } from "./store";

type Env = Readonly<Record<string, unknown>>;

/** The audit log's actions for a suspension and for lifting one early. */
export const SUSPEND_ACTION = "auth:account:suspend";
export const LIFT_ACTION = "auth:account:lift";

/** An account as a moderator about to act on it sees it. */
export interface SuspensionSubject {
  /** Compare it with the moderator's own; never show it. */
  readonly id: string;
  /** The current handle, whichever one was asked for. */
  readonly handle: string;
  readonly name: string;
  /** Config names it an admin, so it can't be suspended. */
  readonly admin: boolean;
  /** The suspension in force, if any. */
  readonly suspension?: Suspension;
}

/** A suspended account, as a list of them shows it. */
export interface SuspendedAccount {
  readonly handle: string;
  readonly name: string;
  readonly suspension: Suspension;
}

async function database(env: Env): Promise<Database> {
  const db = await accountsDatabase(env);
  if (!db) throw new Error(`[svartz:auth] bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to suspend accounts`);
  return db;
}

/** The account that holds or held `handle`, with whether it's an admin and its suspension in force, in one batch. */
async function subjectOf(db: Database, handle: string): Promise<SuspensionSubject | undefined> {
  const [accounts, identities, suspensions] = await db.batch([
    db.prepare("SELECT a.id, a.handle, a.name FROM auth_handles h JOIN auth_accounts a ON a.id = h.account_id WHERE h.handle = ?").bind(handle),
    db.prepare("SELECT i.id FROM auth_handles h JOIN auth_identities i ON i.account_id = h.account_id WHERE h.handle = ?").bind(handle),
    db.prepare(`SELECT p.reason, p.ends_at, p.suspended_at FROM auth_handles h JOIN auth_suspensions p ON p.account_id = h.account_id
      WHERE h.handle = ?1 AND ${inForce("p", "?2")}`).bind(handle, Date.now()),
  ]);
  const account = accounts!.results[0] as { id: string; handle: string; name: string } | undefined;
  if (!account) return undefined;
  const suspension = suspensions!.results[0] as SuspensionRow | undefined;
  return {
    ...account,
    admin: heldRoles((identities!.results as { id: string }[]).map(({ id }) => id), []).includes(ADMIN_ROLE),
    ...suspension && { suspension: suspensionOf(suspension) },
  };
}

/**
 * The account that holds or held `handle`, for a moderator about to suspend it or lift its suspension; `undefined`
 * when no account ever held it or the site binds no `SVARTZ_DB`.
 */
export async function findSuspension(handle: string, env: Env): Promise<SuspensionSubject | undefined> {
  const db = await accountsDatabase(env);
  return db && subjectOf(db, handle);
}

/** Every suspension in force, the most recent first; `[]` without `SVARTZ_DB`. */
export async function listSuspensions(env: Env): Promise<SuspendedAccount[]> {
  const db = await accountsDatabase(env);
  if (!db) return [];
  const { results } = await db.prepare(`SELECT a.handle, a.name, p.reason, p.ends_at, p.suspended_at
    FROM auth_suspensions p JOIN auth_accounts a ON a.id = p.account_id WHERE ${inForce("p", "?")} ORDER BY p.suspended_at DESC`)
    .bind(Date.now()).all<SuspensionRow & { handle: string; name: string }>();
  return results.map((row) => ({ handle: row.handle, name: row.name, suspension: suspensionOf(row) }));
}

/** What {@link suspend} did: suspended the account, or nothing, because no account has the handle, it's an admin, or it's the actor's. */
export type SuspendResult = "suspended" | "not-found" | "admin" | "self";

/**
 * Suspend the account that holds or held `handle` until `until`, or for good without it, with `reason`, which the
 * account reads. It replaces any suspension in force. `actor` is the signed-in moderator, from `readAccount`; check
 * their permission first. Refused without writing anything for an admin and for the actor's own account.
 * Throws without `SVARTZ_DB`.
 */
export async function suspend(env: Env, actor: Pick<Account, "id" | "handle">, { handle, reason, until }: { handle: string; reason: string; until?: Date }): Promise<SuspendResult> {
  const db = await database(env);
  const subject = await subjectOf(db, handle);
  if (!subject) return "not-found";
  if (subject.admin) return "admin";
  if (subject.id === actor.id) return "self";
  const ends = until?.toISOString() ?? null;
  await db.batch([
    db.prepare(`INSERT INTO auth_suspensions (account_id, reason, ends_at, suspended_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (account_id) DO UPDATE SET reason = excluded.reason, ends_at = excluded.ends_at, suspended_at = excluded.suspended_at`)
      .bind(subject.id, reason, until?.getTime() ?? null, new Date().toISOString()),
    auditStatement(db, { actor, action: SUSPEND_ACTION, target: `account:${subject.handle}`, detail: { reason, until: ends } }),
  ]);
  return "suspended";
}

/** What {@link liftSuspension} did. */
export type LiftResult = "lifted" | "not-suspended" | "not-found";

/**
 * End the suspension in force on the account that holds or held `handle` now, ahead of its time. `"not-suspended"`,
 * recording nothing, when none is in force, as when it ended or another moderator lifted it first. Throws without
 * `SVARTZ_DB`.
 */
export async function liftSuspension(env: Env, actor: Pick<Account, "id" | "handle">, handle: string): Promise<LiftResult> {
  const db = await database(env);
  const subject = await subjectOf(db, handle);
  if (!subject) return "not-found";
  const [, entry] = await db.batch([
    db.prepare(`DELETE FROM auth_suspensions WHERE account_id = ?1 AND (ends_at IS NULL OR ends_at > ?2)`).bind(subject.id, Date.now()),
    auditIfChanged(db, { actor, action: LIFT_ACTION, target: `account:${subject.handle}`, detail: subject.suspension ? { reason: subject.suspension.reason } : {} }),
  ]);
  return entry!.results.length > 0 ? "lifted" : "not-suspended";
}

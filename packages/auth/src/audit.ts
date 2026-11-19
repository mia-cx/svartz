/**
 * The audit log: an append-only record of who changed what, and when, in `auth_audit`. Every grant and role change auth
 * makes lands with its entry in one transaction; other plugins record theirs with {@link audit}.
 */
import type { Account } from "./session";
import { accountsDatabase, ACCOUNTS_DATABASE_ENV, type Database, type Statement } from "./store";

/** One change, as the log keeps it. */
export interface AuditEntry {
  /** Who made the change: the signed-in account, as `readAccount` answered it on the server. */
  readonly actor: Pick<Account, "id" | "handle">;
  /** What they did, `<plugin id>:<thing>:<verb>`, such as `auth:grant:set` or `moderation:account:suspend`. */
  readonly action: string;
  /** What they did it to: an object string such as `page:notes/garden/roses`, a role, or an account's handle. */
  readonly target: string;
  /** Anything else a reader of the log needs, such as the value a grant was set to. JSON. */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** The statement that appends `entry`, to run in the batch that makes the change. */
export function auditStatement(db: Database, { actor, action, target, detail = {} }: AuditEntry): Statement {
  return db.prepare(`INSERT INTO auth_audit (at, actor_id, actor_handle, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(new Date().toISOString(), actor.id, actor.handle, action, target, JSON.stringify(detail));
}

/**
 * The statement that appends `entry` only when the statement just before it in the batch changed a row, for a change
 * whose own guard may leave it undone. Its results hold the entry's id when it appended one, and nothing otherwise, so
 * the batch's last result says whether the change happened.
 */
export function auditIfChanged(db: Database, { actor, action, target, detail = {} }: AuditEntry): Statement {
  return db.prepare(`INSERT INTO auth_audit (at, actor_id, actor_handle, action, target, detail)
      SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0 RETURNING id`)
    .bind(new Date().toISOString(), actor.id, actor.handle, action, target, JSON.stringify(detail));
}

/**
 * Append `entry` to the audit log. Pass the change itself as `changes`, statements prepared on the same `SVARTZ_DB`
 * binding: they and the entry run as one transaction, so neither lands without the other. For a change kept elsewhere,
 * call this first and make the change only once it resolves. Throws when the site binds no `SVARTZ_DB`, or the write fails.
 */
export async function audit(env: Readonly<Record<string, unknown>>, entry: AuditEntry, changes: readonly Statement[] = []): Promise<void> {
  const db = await accountsDatabase(env);
  if (!db) throw new Error(`[svartz:auth] bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to keep an audit log`);
  await db.batch([...changes, auditStatement(db, entry)]);
}

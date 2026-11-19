/**
 * The audit log: an append-only record of who changed what, and when, in `auth_audit`. Every grant and role change auth
 * makes lands with its entry in one transaction; other plugins record theirs with {@link audit}, and read the log with
 * {@link readAuditLog}.
 */
import type { Account } from "./session";
import { accountsDatabase, ACCOUNTS_DATABASE_ENV, type Database, type Statement } from "./store";

/** One change, as the log keeps it. */
export interface AuditEntry {
  /** Who made the change: the signed-in account, as `readAccount` answered it on the server. */
  readonly actor: Pick<Account, "id" | "handle">;
  /** What they did, `<plugin id>:<thing>:<verb>`, such as `auth:grant:set` or `moderation:report:resolve`. */
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

/** An entry as {@link readAuditLog} answers it. Every string is as its writer stored it: escape it to show it. */
export interface AuditRecord {
  /** Increases with every entry; {@link AuditQuery.before} pages by it. */
  readonly id: number;
  /** ISO 8601. */
  readonly at: string;
  /** The actor's handle when they made the change. */
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** Which entries {@link readAuditLog} answers. */
export interface AuditQuery {
  /** Only those made by the account that holds or held this handle. */
  readonly actor?: string;
  /** Only those on this exact target, such as `account:ada` or `page:notes/garden`. */
  readonly target?: string;
  /** Only those older than the entry with this id: the previous page's {@link AuditLogPage.next}. */
  readonly before?: number;
  /** Most entries to answer. Default 50. */
  readonly limit?: number;
}

export interface AuditLogPage {
  readonly entries: readonly AuditRecord[];
  /** Pass as {@link AuditQuery.before} for the next, older page; absent on the last. */
  readonly next?: number;
}

const AUDIT_PAGE_SIZE = 50;

/**
 * The audit log, newest first, a page at a time, in one query: every plugin's entries, filtered by who made them and
 * what they changed. Throws when the site binds no `SVARTZ_DB`. The log is append-only, so nothing here changes it.
 */
export async function readAuditLog(env: Readonly<Record<string, unknown>>, { actor, target, before, limit = AUDIT_PAGE_SIZE }: AuditQuery = {}): Promise<AuditLogPage> {
  const db = await accountsDatabase(env);
  if (!db) throw new Error(`[svartz:auth] bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to keep an audit log`);
  // An actor's handle names them at the time, and no handle ever passes to another account: match either that or every
  // handle the account has held, so a renamed moderator's earlier entries are theirs too.
  const { results } = await db.prepare(`SELECT id, at, actor_handle, action, target, detail FROM auth_audit
    WHERE (?1 IS NULL OR actor_handle = ?1 OR actor_id IN (SELECT account_id FROM auth_handles WHERE handle = ?1))
      AND (?2 IS NULL OR target = ?2) AND (?3 IS NULL OR id < ?3)
    ORDER BY id DESC LIMIT ?4`).bind(actor ?? null, target ?? null, before ?? null, limit + 1)
    .all<{ id: number; at: string; actor_handle: string; action: string; target: string; detail: string }>();
  const entries = results.slice(0, limit).map((row): AuditRecord => ({
    id: row.id, at: row.at, actor: row.actor_handle, action: row.action, target: row.target, detail: parsedDetail(row.detail),
  }));
  return { entries, ...results.length > limit && { next: entries.at(-1)!.id } };
}

/** An entry's stored detail, which every writer stores as a JSON object. */
function parsedDetail(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : { detail: value };
  } catch {
    return { detail: text };
  }
}

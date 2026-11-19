/**
 * Reports in D1. The plugin owns its schema and {@link migrate} brings any database up to date on first use. Every
 * table starts with `moderation_`, so the database may be the one auth keeps accounts in.
 */
import type { TargetKind } from "./api";

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

/** What a report is about. */
export interface Target {
  readonly kind: TargetKind;
  readonly id: string;
}

/** Where a report stands: waiting in the queue, or closed by a moderator who acted on it or found nothing to do. */
export type ReportState = "open" | "resolved" | "dismissed";

/** A report as the queue lists it. Who sent it stays in the database and never reaches the panel. */
export interface Report {
  readonly id: string;
  readonly target: Target;
  readonly reason: string;
  /** ISO 8601. */
  readonly createdAt: string;
  readonly state: ReportState;
  /** When a moderator closed it, and their handle then. */
  readonly closedAt?: string;
  readonly closedBy?: string;
}

const MIGRATIONS_TABLE = "moderation_migrations";

/**
 * Each entry is one schema version, applied in order and recorded in {@link MIGRATIONS_TABLE}. Append new versions;
 * never edit an applied one. Racing first requests may apply a version twice, so every statement must be safe to rerun.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS moderation_reports (
      id TEXT PRIMARY KEY,
      vault TEXT NOT NULL,
      target_kind TEXT NOT NULL CHECK (target_kind IN ('page', 'commit', 'submission', 'annotation', 'account')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved', 'dismissed')),
      closed_at TEXT,
      closed_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS moderation_reports_queue ON moderation_reports (vault, state, created_at)`,
    // One open report per reader per target: reporting it again while it waits changes nothing.
    `CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_once
      ON moderation_reports (vault, target_kind, target_id, reporter_id) WHERE state = 'open'`,
    // Reports per account per clock hour, for {@link spendReport}; `window_start` leads so sweeping past hours is a range.
    `CREATE TABLE IF NOT EXISTS moderation_report_counts (
      window_start INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      reports INTEGER NOT NULL,
      PRIMARY KEY (window_start, account_id)
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

const HOUR_MS = 3_600_000;
const MS_PER_SECOND = 1000;

/**
 * Spend one of `account`'s `limit` reports in the current clock hour, or answer the seconds until that hour ends when
 * none are left. One upsert counts and stops at `limit`, so isolates racing on the same database can't overspend.
 */
export async function spendReport(db: Database, account: string, limit: number): Promise<number | undefined> {
  const now = Date.now();
  const windowStart = now - now % HOUR_MS;
  const [, spent] = await db.batch([
    db.prepare("DELETE FROM moderation_report_counts WHERE window_start < ?").bind(windowStart),
    // An exhausted row fails the update's WHERE, so RETURNING answers nothing.
    db.prepare(`INSERT INTO moderation_report_counts (window_start, account_id, reports) VALUES (?1, ?2, 1)
      ON CONFLICT (window_start, account_id) DO UPDATE SET reports = reports + 1 WHERE reports < ?3
      RETURNING reports`).bind(windowStart, account, limit),
  ]);
  return spent!.results.length > 0 ? undefined : Math.ceil((windowStart + HOUR_MS - now) / MS_PER_SECOND);
}

/** A report as a reader sends it; the store adds its id, time and state. */
export interface NewReport {
  readonly vault: string;
  readonly target: Target;
  readonly reason: string;
  /** The reporting account's id. */
  readonly reporter: string;
}

/**
 * Store `report` and answer its id. When the same reader's report of the same target is still open, nothing changes
 * and that report's id is the answer, so a retried or repeated report never queues twice.
 */
export async function fileReport(db: Database, { vault, target, reason, reporter }: NewReport): Promise<string> {
  const [, found] = await db.batch([
    db.prepare(`INSERT INTO moderation_reports (id, vault, target_kind, target_id, reason, reporter_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(crypto.randomUUID(), vault, target.kind, target.id, reason, reporter, new Date().toISOString()),
    db.prepare(`SELECT id FROM moderation_reports
      WHERE vault = ? AND target_kind = ? AND target_id = ? AND reporter_id = ? AND state = 'open'`)
      .bind(vault, target.kind, target.id, reporter),
  ]);
  return (found!.results[0] as { id: string }).id;
}

interface ReportRow {
  id: string;
  target_kind: TargetKind;
  target_id: string;
  reason: string;
  created_at: string;
  state: ReportState;
  closed_at: string | null;
  closed_by: string | null;
}

const COLUMNS = "id, target_kind, target_id, reason, created_at, state, closed_at, closed_by";

const reportOf = (row: ReportRow): Report => ({
  id: row.id,
  target: { kind: row.target_kind, id: row.target_id },
  reason: row.reason,
  createdAt: row.created_at,
  state: row.state,
  ...row.closed_at !== null && { closedAt: row.closed_at },
  ...row.closed_by !== null && { closedBy: row.closed_by },
});

/** Report `id` of `vault`, or `undefined`. */
export async function findReport(db: Database, vault: string, id: string): Promise<Report | undefined> {
  const { results: [row] } = await db.prepare(`SELECT ${COLUMNS} FROM moderation_reports WHERE id = ? AND vault = ?`)
    .bind(id, vault).all<ReportRow>();
  return row && reportOf(row);
}

/**
 * Up to `limit` of `vault`'s open reports, oldest first, as a queue is worked; or its closed ones, most recently closed
 * first. Answers how many there are in all, of each.
 */
export async function listReports(db: Database, vault: string, open: boolean, limit: number): Promise<{ reports: Report[]; open: number; closed: number }> {
  const [rows, counts] = await db.batch([
    open
      ? db.prepare(`SELECT ${COLUMNS} FROM moderation_reports WHERE vault = ? AND state = 'open' ORDER BY created_at, id LIMIT ?`).bind(vault, limit)
      : db.prepare(`SELECT ${COLUMNS} FROM moderation_reports WHERE vault = ? AND state <> 'open' ORDER BY closed_at DESC, id LIMIT ?`).bind(vault, limit),
    db.prepare(`SELECT COALESCE(SUM(state = 'open'), 0) AS open, COALESCE(SUM(state <> 'open'), 0) AS closed FROM moderation_reports WHERE vault = ?`).bind(vault),
  ]);
  const count = counts!.results[0] as { open: number; closed: number };
  return { reports: (rows!.results as ReportRow[]).map(reportOf), open: count.open, closed: count.closed };
}

/** The statement that closes open report `id` of `vault` as `state`, by the moderator with handle `by`. A closed report stays as it was. */
export function closeStatement(db: Database, vault: string, id: string, state: Exclude<ReportState, "open">, by: string): Statement {
  return db.prepare("UPDATE moderation_reports SET state = ?, closed_at = ?, closed_by = ? WHERE id = ? AND vault = ? AND state = 'open'")
    .bind(state, new Date().toISOString(), by, id, vault);
}

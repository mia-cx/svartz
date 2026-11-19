/**
 * The GitHub mirror in D1, and the edits the site saved. The plugin owns its schema: {@link migrate} brings any
 * database up to date on first use. Every table starts `submissions_`, so the database may be the one `auth` uses.
 *
 * Rows are keyed by a scope, `<owner/name>:<vault folder>`, so vaults sharing a database never share rows. Within a
 * scope the mirror holds:
 *
 * - `submissions_commits`: commits on the content branch that touch the vault folder, with the files they changed in it.
 * - `submissions_pulls`: pull requests into the content branch. `in_vault` says whether one changes a file in the
 *   vault folder, `NULL` until the poll has read its files, `files_read` counting the pages read so far at its
 *   head; readers keep to `in_vault = 1`.
 * - `submissions_reviews` and `submissions_comments`: what was said on those pull requests, `comments.kind` being
 *   `issue` (the conversation) or `review` (a diff line). Deleted comments stay as tombstones with an empty body.
 * - `submissions_runs`: workflow runs on the content branch, and `submissions_deployments`: deployments with their
 *   latest status, `succeeded` once any status said `success`, since a later `inactive` doesn't say, and
 *   `statuses_read`, the latest status id the poll has seen in a deployment's whole status history.
 * - `submissions_edits`: every save the site made, keyed by its submission id, with who made it.
 *
 * Deliveries arrive at least once and in any order, so every write is idempotent and never moves a record backwards:
 * a pull request by `updated_at`, a run by attempt and progress, a deployment by status id, a comment until deleted.
 */
import type { CommentRecord, CommitRecord, DeploymentRecord, DeploymentStatus, PullRecord, ReviewRecord, RunRecord } from "./records";

/** The slice of Cloudflare's `D1Database` the mirror uses. */
export interface Database {
  prepare(query: string): Statement;
  /** All of `statements` in one transaction and one call, answering each one's rows in order. */
  batch<Row = Record<string, unknown>>(statements: Statement[]): Promise<{ results: Row[] }[]>;
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<unknown>;
}

export const isDatabase = (value: unknown): value is Database =>
  typeof value === "object" && value !== null && typeof (value as Database).prepare === "function";

const MIGRATIONS_TABLE = "submissions_migrations";

/**
 * Each entry is one schema version, applied in order and recorded in {@link MIGRATIONS_TABLE}. Append new versions;
 * never edit an applied one. Two first requests can race to apply a version, so statements must be safe to run twice.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS submissions_sync (
      scope TEXT PRIMARY KEY,
      branch TEXT,
      polled_at INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0,
      paused_until INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS submissions_etags (
      scope TEXT NOT NULL,
      path TEXT NOT NULL,
      etag TEXT NOT NULL,
      PRIMARY KEY (scope, path)
    )`,
    `CREATE TABLE IF NOT EXISTS submissions_commits (
      scope TEXT NOT NULL,
      sha TEXT NOT NULL,
      message TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_login TEXT,
      committer_email TEXT NOT NULL,
      trailer_account TEXT,
      committed_at TEXT NOT NULL,
      url TEXT NOT NULL,
      files TEXT,
      PRIMARY KEY (scope, sha)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_commits_by_time ON submissions_commits (scope, committed_at)`,
    `CREATE TABLE IF NOT EXISTS submissions_pulls (
      scope TEXT NOT NULL,
      number INTEGER NOT NULL,
      state TEXT NOT NULL,
      title TEXT NOT NULL,
      author_login TEXT,
      head_ref TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      base_ref TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      merged_at TEXT,
      merge_commit TEXT,
      in_vault INTEGER,
      files_read INTEGER NOT NULL DEFAULT 0,
      reviews_synced_at TEXT,
      PRIMARY KEY (scope, number)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_pulls_by_time ON submissions_pulls (scope, updated_at)`,
    `CREATE TABLE IF NOT EXISTS submissions_reviews (
      scope TEXT NOT NULL,
      id INTEGER NOT NULL,
      pull_number INTEGER NOT NULL,
      state TEXT NOT NULL,
      author_login TEXT,
      body TEXT NOT NULL,
      commit_sha TEXT,
      url TEXT NOT NULL,
      submitted_at TEXT,
      PRIMARY KEY (scope, id)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_reviews_by_pull ON submissions_reviews (scope, pull_number)`,
    `CREATE TABLE IF NOT EXISTS submissions_comments (
      scope TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('issue', 'review')),
      id INTEGER NOT NULL,
      pull_number INTEGER NOT NULL,
      author_login TEXT,
      body TEXT NOT NULL,
      path TEXT,
      line INTEGER,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope, kind, id)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_comments_by_pull ON submissions_comments (scope, pull_number, created_at)`,
    `CREATE TABLE IF NOT EXISTS submissions_runs (
      scope TEXT NOT NULL,
      id INTEGER NOT NULL,
      workflow_path TEXT NOT NULL,
      name TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      head_branch TEXT,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      conclusion TEXT,
      progress INTEGER NOT NULL,
      attempt INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, id)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_runs_by_workflow ON submissions_runs (scope, workflow_path, created_at)`,
    `CREATE TABLE IF NOT EXISTS submissions_deployments (
      scope TEXT NOT NULL,
      id INTEGER NOT NULL,
      sha TEXT NOT NULL,
      ref TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status_id INTEGER,
      state TEXT,
      status_url TEXT,
      status_at TEXT,
      succeeded INTEGER NOT NULL DEFAULT 0,
      statuses_read INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope, id)
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_deployments_by_environment ON submissions_deployments (scope, environment, created_at)`,
    `CREATE TABLE IF NOT EXISTS submissions_edits (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      owner TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('commit', 'pull-request')),
      page TEXT NOT NULL,
      path TEXT NOT NULL,
      commit_sha TEXT,
      pull_number INTEGER,
      url TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      live_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS submissions_edits_by_owner ON submissions_edits (scope, owner, saved_at)`,
    // Whether `descendant` contains `ancestor`, as GitHub's compare said. Commits never change, so neither does this.
    `CREATE TABLE IF NOT EXISTS submissions_ancestry (
      scope TEXT NOT NULL,
      ancestor TEXT NOT NULL,
      descendant TEXT NOT NULL,
      contains INTEGER NOT NULL,
      PRIMARY KEY (scope, ancestor, descendant)
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

/** One vault's view of the mirror: its database and its scope in it. */
export interface Mirror {
  readonly db: Database;
  readonly scope: string;
}

/** `<owner/name>:<vault folder>`. GitHub's repository names ignore case. */
export const scopeOf = (repo: string, root: string) => `${repo.toLowerCase()}:${root}`;

export function writeCommit({ db, scope }: Mirror, commit: CommitRecord): Statement {
  return db.prepare(`INSERT INTO submissions_commits
      (scope, sha, message, author_name, author_email, author_login, committer_email, trailer_account, committed_at, url, files)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT (scope, sha) DO UPDATE SET
      files = COALESCE(submissions_commits.files, excluded.files),
      author_login = COALESCE(submissions_commits.author_login, excluded.author_login)`)
    .bind(
      scope, commit.sha, commit.message, commit.authorName, commit.authorEmail, commit.authorLogin, commit.committerEmail,
      commit.trailerAccount, commit.committedAt, commit.url, commit.files && JSON.stringify(commit.files),
    );
}

/**
 * A pull request, unless the mirror holds a newer update. `known` is its `in_vault` when it needs no lookup, as when
 * the vault is the whole repository; a new head commit forgets the old answer and the pages read toward it, since
 * it may change other files.
 */
export function writePull({ db, scope }: Mirror, pull: PullRecord, known: 1 | null): Statement {
  return db.prepare(`INSERT INTO submissions_pulls
      (scope, number, state, title, author_login, head_ref, head_sha, base_ref, url, created_at, updated_at, closed_at, merged_at, merge_commit, in_vault)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
    ON CONFLICT (scope, number) DO UPDATE SET
      state = excluded.state, title = excluded.title, head_ref = excluded.head_ref, head_sha = excluded.head_sha,
      base_ref = excluded.base_ref, url = excluded.url, updated_at = excluded.updated_at, closed_at = excluded.closed_at,
      merged_at = COALESCE(submissions_pulls.merged_at, excluded.merged_at),
      merge_commit = COALESCE(submissions_pulls.merge_commit, excluded.merge_commit),
      in_vault = CASE WHEN excluded.head_sha = submissions_pulls.head_sha THEN COALESCE(submissions_pulls.in_vault, excluded.in_vault) ELSE excluded.in_vault END,
      files_read = CASE WHEN excluded.head_sha = submissions_pulls.head_sha THEN submissions_pulls.files_read ELSE 0 END
    WHERE excluded.updated_at >= submissions_pulls.updated_at`)
    .bind(
      scope, pull.number, pull.state, pull.title, pull.author, pull.headRef, pull.headSha, pull.baseRef, pull.url,
      pull.createdAt, pull.updatedAt, pull.closedAt, pull.mergedAt, pull.mergeCommit, known,
    );
}

/**
 * A review; once dismissed, it stays dismissed. A review carries no time to order its edits by, so a delivery that
 * writes one also needs {@link rereadReviews}.
 */
export function writeReview({ db, scope }: Mirror, review: ReviewRecord): Statement {
  return db.prepare(`INSERT INTO submissions_reviews (scope, id, pull_number, state, author_login, body, commit_sha, url, submitted_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT (scope, id) DO UPDATE SET state = excluded.state, body = excluded.body
    WHERE submissions_reviews.state <> 'dismissed'`)
    .bind(scope, review.id, review.pull, review.state, review.author, review.body, review.commit, review.url, review.submittedAt);
}

/** Have the next poll read pull request `number`'s reviews from GitHub, which settles a delivery that arrived late. */
export function rereadReviews({ db, scope }: Mirror, number: number): Statement {
  return db.prepare("UPDATE submissions_pulls SET reviews_synced_at = NULL WHERE scope = ? AND number = ?").bind(scope, number);
}

/** A comment, unless the mirror holds a newer edit; once deleted, it stays a tombstone. */
export function writeComment({ db, scope }: Mirror, comment: CommentRecord): Statement {
  return db.prepare(`INSERT INTO submissions_comments
      (scope, kind, id, pull_number, author_login, body, path, line, url, created_at, updated_at, deleted)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT (scope, kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted
    WHERE submissions_comments.deleted = 0 AND (excluded.deleted = 1 OR excluded.updated_at >= submissions_comments.updated_at)`)
    .bind(
      scope, comment.kind, comment.id, comment.pull, comment.author, comment.body, comment.path, comment.line, comment.url,
      comment.createdAt, comment.updatedAt, comment.deleted ? 1 : 0,
    );
}

/** A run, unless the mirror holds a later attempt, or the same attempt further along. */
export function writeRun({ db, scope }: Mirror, run: RunRecord): Statement {
  return db.prepare(`INSERT INTO submissions_runs
      (scope, id, workflow_path, name, head_sha, head_branch, event, status, conclusion, progress, attempt, url, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT (scope, id) DO UPDATE SET
      status = excluded.status, conclusion = excluded.conclusion, progress = excluded.progress, attempt = excluded.attempt,
      url = excluded.url, updated_at = excluded.updated_at
    WHERE excluded.attempt > submissions_runs.attempt
      OR (excluded.attempt = submissions_runs.attempt AND (excluded.progress > submissions_runs.progress
        OR (excluded.progress = submissions_runs.progress AND excluded.updated_at >= submissions_runs.updated_at)))`)
    .bind(
      scope, run.id, run.workflowPath, run.name, run.headSha, run.headBranch, run.event, run.status, run.conclusion,
      run.progress, run.attempt, run.url, run.createdAt, run.updatedAt,
    );
}

/** A deployment, and its status unless the mirror holds a later one. A `success` status also needs {@link markSucceeded}. */
export function writeDeployment({ db, scope }: Mirror, deployment: DeploymentRecord): Statement {
  const status: Partial<DeploymentStatus> = deployment.status ?? {};
  return db.prepare(`INSERT INTO submissions_deployments (scope, id, sha, ref, environment, created_at, status_id, state, status_url, status_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT (scope, id) DO UPDATE SET
      status_id = excluded.status_id, state = excluded.state, status_url = excluded.status_url, status_at = excluded.status_at
    WHERE excluded.status_id > COALESCE(submissions_deployments.status_id, 0)`)
    .bind(
      scope, deployment.id, deployment.sha, deployment.ref, deployment.environment, deployment.createdAt,
      status.id ?? null, status.state ?? null, status.url ?? null, status.createdAt ?? null,
    );
}

/** Record that a status of deployment `id` said `success`: it was live, whatever status came before or after. */
export function markSucceeded({ db, scope }: Mirror, id: number): Statement {
  return db.prepare("UPDATE submissions_deployments SET succeeded = 1 WHERE scope = ? AND id = ?").bind(scope, id);
}

/** Remember the content branch's name, which GitHub's deliveries carry, when config leaves it to the default branch. */
export function writeBranch({ db, scope }: Mirror, branch: string): Statement {
  return db.prepare(`INSERT INTO submissions_sync (scope, branch) VALUES (?1, ?2)
    ON CONFLICT (scope) DO UPDATE SET branch = excluded.branch`).bind(scope, branch);
}

/** A save the site made, by its submission id. A retry under the same id keeps the first record and its owner. */
export interface EditRecord {
  readonly id: string;
  /** `account:<id>` or `identity:<id>` of who saved it; `null` for a guest, whose browser holds the id alone. */
  readonly owner: string | null;
  readonly kind: "commit" | "pull-request";
  /** The edited page's route, or a new page's repository path without `.md`. */
  readonly page: string;
  readonly path: string;
  readonly commit: string | null;
  readonly pull: number | null;
  readonly url: string;
  readonly savedAt: string;
  readonly liveAt: string | null;
}

export async function recordEdit({ db, scope }: Mirror, edit: Omit<EditRecord, "liveAt">): Promise<void> {
  await db.prepare(`INSERT INTO submissions_edits (id, scope, owner, kind, page, path, commit_sha, pull_number, url, saved_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT (id) DO NOTHING`)
    .bind(edit.id, scope, edit.owner, edit.kind, edit.page, edit.path, edit.commit, edit.pull, edit.url, edit.savedAt).run();
}

interface EditRow {
  id: string;
  owner: string | null;
  kind: EditRecord["kind"];
  page: string;
  path: string;
  commit_sha: string | null;
  pull_number: number | null;
  url: string;
  saved_at: string;
  live_at: string | null;
}

export async function readEdit({ db, scope }: Mirror, id: string): Promise<EditRecord | undefined> {
  const { results: [row] } = await db.prepare("SELECT * FROM submissions_edits WHERE id = ? AND scope = ?").bind(id, scope).all<EditRow>();
  return row && {
    id: row.id,
    owner: row.owner,
    kind: row.kind,
    page: row.page,
    path: row.path,
    commit: row.commit_sha,
    pull: row.pull_number,
    url: row.url,
    savedAt: row.saved_at,
    liveAt: row.live_at,
  };
}

/** Record that the edit is live: a live edit stays live. */
export async function markLive({ db, scope }: Mirror, id: string, at: string): Promise<void> {
  await db.prepare("UPDATE submissions_edits SET live_at = ? WHERE id = ? AND scope = ? AND live_at IS NULL").bind(at, id, scope).run();
}

/** What the mirror knows of pull request `number`. */
export async function readPull({ db, scope }: Mirror, number: number) {
  const { results: [row] } = await db.prepare("SELECT state, url, merged_at, merge_commit FROM submissions_pulls WHERE scope = ? AND number = ?")
    .bind(scope, number).all<{ state: PullRecord["state"]; url: string; merged_at: string | null; merge_commit: string | null }>();
  return row;
}

/** A run or deployment that puts commit `sha` live: its outcome so far, and when it started. */
export interface Signal {
  readonly sha: string;
  readonly outcome: "pending" | "success" | "failure";
  readonly createdAt: string;
}

/** How many recent live signals since an edit landed are weighed, and how many earlier successes besides. */
const MAX_SIGNALS = 20;

/**
 * Signals from `candidates` (a query of `sha`, `outcome` and `created_at`, with `?1` the scope), newest first: the
 * latest {@link MAX_SIGNALS}, and as many more successes where GitHub hasn't said `sha` misses the commit bound as
 * `?2`. A success stays evidence however many attempts follow it, and one known to miss makes room for the next.
 */
const recentAndSucceeded = (candidates: string) => `WITH candidates AS (${candidates})
  SELECT * FROM (SELECT * FROM candidates ORDER BY created_at DESC LIMIT ?3)
  UNION
  SELECT * FROM (SELECT * FROM candidates WHERE outcome = 'success' AND NOT EXISTS (SELECT 1 FROM submissions_ancestry
    WHERE scope = ?1 AND ancestor = ?2 AND descendant = candidates.sha AND contains = 0) ORDER BY created_at DESC LIMIT ?3)
  ORDER BY created_at DESC`;

/** The rows a signals query answers. A `null` outcome says nothing about the commit. */
export type SignalRow = { readonly sha: string; readonly outcome: Signal["outcome"] | null; readonly created_at: string };

/** A signals query's rows, without those that say nothing. */
export const toSignals = (rows: readonly SignalRow[]): Signal[] =>
  rows.flatMap(({ sha, outcome, created_at }) => (outcome ? [{ sha, outcome, createdAt: created_at }] : []));

/**
 * The runs of `workflow` on `branch` made since `since`, newest first, weighed for whether they put `commit` live, as
 * a statement answering {@link SignalRow}s. A completed run that neither succeeded nor failed (cancelled, skipped)
 * says nothing about the edit and is left out.
 */
export function workflowSignals({ db, scope }: Mirror, workflow: string, branch: string, since: string, commit: string): Statement {
  return db.prepare(recentAndSucceeded(`SELECT id, head_sha AS sha, created_at,
      CASE WHEN status != 'completed' THEN 'pending'
        WHEN conclusion = 'success' THEN 'success'
        WHEN conclusion IN ('failure', 'timed_out', 'startup_failure') THEN 'failure' END AS outcome
    FROM submissions_runs WHERE scope = ?1 AND workflow_path = ?4 AND head_branch = ?5 AND created_at >= ?6`))
    .bind(scope, commit, MAX_SIGNALS, workflow, branch, since);
}

/**
 * The deployments to `environment` made since `since`, newest first, weighed for whether they put `commit` live, as
 * a statement answering {@link SignalRow}s. One that ever succeeded is a success. One made `inactive` without
 * succeeding says nothing: GitHub lets a failed or unfinished deployment be deactivated too.
 */
export function deploymentSignals({ db, scope }: Mirror, environment: string, since: string, commit: string): Statement {
  return db.prepare(recentAndSucceeded(`SELECT id, sha, created_at,
      CASE WHEN succeeded = 1 THEN 'success'
        WHEN state IN ('failure', 'error') THEN 'failure'
        WHEN state IS NOT 'inactive' THEN 'pending' END AS outcome
    FROM submissions_deployments WHERE scope = ?1 AND environment = ?4 AND created_at >= ?5`))
    .bind(scope, commit, MAX_SIGNALS, environment, since);
}

/** The rows an ancestry query answers: whether `descendant` contains `ancestor`, as GitHub said. */
export type AncestryRow = { readonly ancestor: string; readonly descendant: string; readonly contains: number };

/** What GitHub said about whether any commit contains each of `ancestors`, as a statement answering {@link AncestryRow}s. */
export function ancestryOf({ db, scope }: Mirror, ancestors: readonly string[]): Statement {
  return db.prepare("SELECT ancestor, descendant, contains FROM submissions_ancestry WHERE scope = ? AND ancestor IN (SELECT value FROM json_each(?))")
    .bind(scope, JSON.stringify(ancestors));
}

export async function writeAncestry({ db, scope }: Mirror, ancestor: string, descendant: string, contains: boolean): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO submissions_ancestry (scope, ancestor, descendant, contains) VALUES (?, ?, ?, ?)")
    .bind(scope, ancestor, descendant, contains ? 1 : 0).run();
}

/** A mirrored commit as a list of edits shows it, with the account it may be credited to. */
export interface ListedCommit {
  readonly sha: string;
  readonly message: string;
  readonly authorName: string;
  readonly authorLogin: string | null;
  readonly committedAt: string;
  /** Its changed files inside the vault, as repository paths; `null` until the poll reads them. */
  readonly files: readonly string[] | null;
  /**
   * The account that made it, by id, only from the site's own record of a save: a direct commit with this SHA, or a
   * submission whose pull request the mirror says merged as this commit. `null` for every other commit, whatever its
   * trailer, author or committer say: those are git metadata whoever makes the commit chooses.
   */
  readonly account: string | null;
}

/**
 * Up to `limit` of the vault's commits, newest first (by commit time, then SHA), after the commit `before` when given.
 * A `before` the mirror doesn't hold answers none.
 */
export async function listCommits({ db, scope }: Mirror, { before, limit }: { before?: string; limit: number }): Promise<ListedCommit[]> {
  const { results } = await db.prepare(`SELECT c.sha, c.message, c.author_name, c.author_login, c.committed_at, c.files,
      (SELECT substr(e.owner, 9) FROM submissions_edits e
        LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number
        WHERE e.scope = c.scope AND e.owner LIKE 'account:%'
          AND ((e.kind = 'commit' AND e.commit_sha = c.sha) OR (p.merged_at IS NOT NULL AND p.merge_commit = c.sha))
        ORDER BY e.saved_at LIMIT 1) AS account
    FROM submissions_commits c
    WHERE c.scope = ?1 AND (?2 IS NULL OR (c.committed_at, c.sha) < (SELECT committed_at, sha FROM submissions_commits WHERE scope = ?1 AND sha = ?2))
    ORDER BY c.committed_at DESC, c.sha DESC
    LIMIT ?3`)
    .bind(scope, before ?? null, limit)
    .all<{ sha: string; message: string; author_name: string; author_login: string | null; committed_at: string; files: string | null; account: string | null }>();
  return results.map((row) => ({
    sha: row.sha,
    message: row.message,
    authorName: row.author_name,
    authorLogin: row.author_login,
    committedAt: row.committed_at,
    files: row.files === null ? null : JSON.parse(row.files) as string[],
    account: row.account,
  }));
}

/** The content branch's name as deliveries or a poll last said, for a vault that leaves it to the default branch. */
export async function readBranch({ db, scope }: Mirror): Promise<string | undefined> {
  const { results: [row] } = await db.prepare("SELECT branch FROM submissions_sync WHERE scope = ?").bind(scope).all<{ branch: string | null }>();
  return row?.branch ?? undefined;
}

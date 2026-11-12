/**
 * Annotations in D1. The plugin owns its schema: {@link migrate} brings any database up to date on first use.
 */
import type { Identity } from "@svartz/auth";
import type { Anchor } from "./anchor";

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

/** Someone who agreed with a comment with **+1**. */
export interface Agreement {
  readonly author: Identity;
  readonly createdAt: string;
}

interface AnnotationBase {
  readonly id: string;
  readonly anchor: Anchor;
  readonly author: Identity;
  /** ISO 8601. */
  readonly createdAt: string;
  /** Oldest first. Only comments collect agreements. */
  readonly agreements: readonly Agreement[];
}

/** A comment or reaction on a passage, as `GET <mount>/_svartz/annotations/?page=` lists it. */
export type Annotation =
  | (AnnotationBase & { readonly kind: "comment"; readonly body: string })
  | (AnnotationBase & { readonly kind: "reaction"; readonly reaction: string });

const MIGRATIONS_TABLE = "svartz_annotations_migrations";

/**
 * Each entry is one schema version, applied in order and recorded in {@link MIGRATIONS_TABLE}. Append new versions;
 * never edit an applied one. Two first requests can race to apply the same version, so statements must be safe to
 * run twice (`IF NOT EXISTS`) wherever SQLite allows.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      handle TEXT,
      avatar_url TEXT,
      profile_url TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      vault TEXT NOT NULL,
      page TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('reaction', 'comment')),
      reaction TEXT CHECK ((kind = 'reaction') = (reaction IS NOT NULL)),
      body TEXT CHECK ((kind = 'comment') = (body IS NOT NULL)),
      exact TEXT NOT NULL,
      prefix TEXT NOT NULL,
      suffix TEXT NOT NULL,
      start INTEGER NOT NULL,
      "end" INTEGER NOT NULL,
      author_id TEXT NOT NULL REFERENCES identities (id),
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS annotations_by_page ON annotations (vault, page, created_at)`,
    // Reacting twice with the same reaction to the same passage toggles it off instead.
    `CREATE UNIQUE INDEX IF NOT EXISTS annotations_one_reaction
      ON annotations (vault, page, author_id, reaction, start, "end") WHERE kind = 'reaction'`,
    `CREATE TABLE IF NOT EXISTS agreements (
      annotation_id TEXT NOT NULL REFERENCES annotations (id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES identities (id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (annotation_id, author_id)
    )`,
  ],
  [
    // Writes per reader per clock hour, for {@link spendWrite}. `window_start` leads the key so sweeping past hours is
    // an index range, and nothing references identities: a refused first write has no identity row yet.
    `CREATE TABLE IF NOT EXISTS write_counts (
      window_start INTEGER NOT NULL,
      identity_id TEXT NOT NULL,
      writes INTEGER NOT NULL,
      PRIMARY KEY (window_start, identity_id)
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
 * Spend one of `identity`'s `limit` writes in the current clock hour, or answer the seconds until that hour ends when
 * none are left. One upsert counts and stops at `limit`, so isolates racing on the same database can't overspend.
 * Past hours are swept in the same batch.
 */
export async function spendWrite(db: Database, identity: string, limit: number): Promise<number | undefined> {
  const now = Date.now();
  const windowStart = now - now % HOUR_MS;
  const [, spent] = await db.batch([
    db.prepare("DELETE FROM write_counts WHERE window_start < ?").bind(windowStart),
    // An exhausted row fails the update's WHERE, so RETURNING answers nothing.
    db.prepare(`INSERT INTO write_counts (window_start, identity_id, writes) VALUES (?1, ?2, 1)
      ON CONFLICT (window_start, identity_id) DO UPDATE SET writes = writes + 1 WHERE writes < ?3
      RETURNING writes`).bind(windowStart, identity, limit),
  ]);
  return spent!.results.length > 0 ? undefined : Math.ceil((windowStart + HOUR_MS - now) / MS_PER_SECOND);
}

interface IdentityRow {
  author_id: string;
  provider: Identity["provider"];
  name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_url: string | null;
}

interface AnnotationRow extends IdentityRow {
  id: string;
  kind: Annotation["kind"];
  reaction: string | null;
  body: string | null;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  created_at: string;
}

interface AgreementRow extends IdentityRow {
  annotation_id: string;
  created_at: string;
}

const AUTHOR_COLUMNS = "i.id AS author_id, i.provider, i.name, i.handle, i.avatar_url, i.profile_url";

function identityOf(row: IdentityRow): Identity {
  return {
    id: row.author_id,
    provider: row.provider,
    name: row.name,
    ...row.handle !== null && { handle: row.handle },
    ...row.avatar_url !== null && { avatarUrl: row.avatar_url },
    ...row.profile_url !== null && { profileUrl: row.profile_url },
  };
}

const agreementOf = (row: AgreementRow): Agreement => ({ author: identityOf(row), createdAt: row.created_at });

/**
 * Refresh `author`'s identity row with what their session says now: name, handle, avatar and profile link, nothing
 * more. Batched with the write it accompanies, so nothing lands without its author.
 */
function upsertIdentity(db: Database, author: Identity, at: string): Statement {
  return db.prepare(`INSERT INTO identities (id, provider, name, handle, avatar_url, profile_url, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, name = excluded.name, handle = excluded.handle,
      avatar_url = excluded.avatar_url, profile_url = excluded.profile_url, updated_at = excluded.updated_at`)
    .bind(author.id, author.provider, author.name, author.handle ?? null, author.avatarUrl ?? null, author.profileUrl ?? null, at);
}

/** `author` as the store keeps and lists them: only the fields {@link upsertIdentity} writes. */
const stored = (author: Identity): Identity => identityOf({
  author_id: author.id,
  provider: author.provider,
  name: author.name,
  handle: author.handle ?? null,
  avatar_url: author.avatarUrl ?? null,
  profile_url: author.profileUrl ?? null,
});

/** A comment as a reader posts it; the store adds its id and time. */
export interface NewComment {
  readonly vault: string;
  readonly page: string;
  readonly anchor: Anchor;
  readonly body: string;
  readonly author: Identity;
}

/** Store `comment`, refreshing its author's identity row in the same batch. */
export async function createComment(db: Database, { vault, page, anchor, body, author }: NewComment): Promise<Annotation> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.batch([
    upsertIdentity(db, author, createdAt),
    db.prepare(`INSERT INTO annotations (id, vault, page, kind, body, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES (?, ?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, vault, page, body, anchor.exact, anchor.prefix, anchor.suffix, anchor.start, anchor.end, author.id, createdAt),
  ]);
  return { id, kind: "comment", body, anchor, author: stored(author), createdAt, agreements: [] };
}

/** A reader agreeing with a comment (`agreed: true`), or taking it back. */
export interface AgreementChange {
  readonly vault: string;
  readonly annotation: string;
  readonly author: Identity;
  readonly agreed: boolean;
}

/**
 * Make `author`'s agreement with `annotation` what `agreed` says, and answer the comment's agreements after the change,
 * oldest first. Setting a state rather than flipping one makes a retried request harmless, and the primary key keeps
 * racing requests to one agreement each. Answers `"missing"` when `vault` has no such annotation and `"reaction"` when
 * it isn't a comment, changing nothing.
 */
export async function setAgreement(db: Database, { vault, annotation, author, agreed }: AgreementChange): Promise<Agreement[] | "missing" | "reaction"> {
  const { results: [target] } = await db.prepare("SELECT kind FROM annotations WHERE id = ? AND vault = ?")
    .bind(annotation, vault).all<{ kind: Annotation["kind"] }>();
  if (!target) return "missing";
  if (target.kind !== "comment") return "reaction";

  const createdAt = new Date().toISOString();
  // Taking an agreement back stores nothing about the reader, so it doesn't refresh their identity.
  const change = agreed
    ? [
      upsertIdentity(db, author, createdAt),
      // Through the comment itself, so a comment deleted since the check above gains nothing.
      db.prepare(`INSERT INTO agreements (annotation_id, author_id, created_at)
        SELECT id, ?2, ?3 FROM annotations WHERE id = ?1 AND kind = 'comment'
        ON CONFLICT (annotation_id, author_id) DO NOTHING`).bind(annotation, author.id, createdAt),
    ]
    : [db.prepare("DELETE FROM agreements WHERE annotation_id = ? AND author_id = ?").bind(annotation, author.id)];
  const answers = await db.batch([
    ...change,
    db.prepare(`SELECT g.annotation_id, g.created_at, ${AUTHOR_COLUMNS}
      FROM agreements g JOIN identities i ON i.id = g.author_id
      WHERE g.annotation_id = ?
      ORDER BY g.created_at`).bind(annotation),
  ]);
  return (answers.at(-1)!.results as AgreementRow[]).map(agreementOf);
}

/** A reader deleting an annotation: its author, or a moderator, who may delete anyone's. */
export interface Deletion {
  readonly vault: string;
  readonly annotation: string;
  /** The identity id of who asks. */
  readonly by: string;
  readonly moderator: boolean;
}

/**
 * Delete `annotation` and its agreements in one batch, when `by` wrote it or is a moderator. Answers `"missing"` when
 * `vault` has no such annotation, which is also what a retry finds, and `"forbidden"` for anyone else, changing nothing.
 */
export async function deleteAnnotation(db: Database, { vault, annotation, by, moderator }: Deletion): Promise<"deleted" | "missing" | "forbidden"> {
  const { results: [target] } = await db.prepare("SELECT author_id FROM annotations WHERE id = ? AND vault = ?")
    .bind(annotation, vault).all<{ author_id: string }>();
  if (!target) return "missing";
  if (target.author_id !== by && !moderator) return "forbidden";
  // Agreements first and explicitly, rather than trusting the foreign key's cascade to be enforced.
  await db.batch([
    db.prepare("DELETE FROM agreements WHERE annotation_id = ?").bind(annotation),
    db.prepare("DELETE FROM annotations WHERE id = ? AND vault = ?").bind(annotation, vault),
  ]);
  return "deleted";
}

/** Every annotation on `page` of `vault`, oldest first, with its author and agreements. */
export async function listPage(db: Database, vault: string, page: string): Promise<Annotation[]> {
  const [annotationRows, agreementRows] = await db.batch([
    db.prepare(`SELECT a.id, a.kind, a.reaction, a.body, a.exact, a.prefix, a.suffix, a.start, a."end", a.created_at, ${AUTHOR_COLUMNS}
      FROM annotations a JOIN identities i ON i.id = a.author_id
      WHERE a.vault = ?1 AND a.page = ?2
      ORDER BY a.created_at, a.id`).bind(vault, page),
    db.prepare(`SELECT g.annotation_id, g.created_at, ${AUTHOR_COLUMNS}
      FROM agreements g JOIN annotations a ON a.id = g.annotation_id JOIN identities i ON i.id = g.author_id
      WHERE a.vault = ?1 AND a.page = ?2
      ORDER BY g.created_at`).bind(vault, page),
  ]);

  const agreements = new Map<string, Agreement[]>();
  for (const row of agreementRows!.results as AgreementRow[]) {
    const list = agreements.get(row.annotation_id) ?? [];
    list.push(agreementOf(row));
    agreements.set(row.annotation_id, list);
  }

  return (annotationRows!.results as AnnotationRow[]).map((row) => {
    const base = {
      id: row.id,
      anchor: { exact: row.exact, prefix: row.prefix, suffix: row.suffix, start: row.start, end: row.end },
      author: identityOf(row),
      createdAt: row.created_at,
      agreements: agreements.get(row.id) ?? [],
    };
    return row.kind === "comment" ? { ...base, kind: "comment", body: row.body! } : { ...base, kind: "reaction", reaction: row.reaction! };
  });
}

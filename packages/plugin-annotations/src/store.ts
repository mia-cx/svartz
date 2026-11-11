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
    list.push({ author: identityOf(row), createdAt: row.created_at });
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

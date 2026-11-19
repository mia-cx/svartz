/**
 * The moderation plugin behind Svartz's real server router, beside the real `auth` and `annotations` plugins, on a real
 * D1 from Miniflare. Node only: the server tests use it directly, and the browser tests reach it through the Vite
 * middleware and commands in vitest.config.ts.
 */
import type { Identity } from "@svartz/auth";
import { createServer, type PageResult, type PermissionDeclaration } from "@svartz/core";
import { isVaultSubmission } from "@svartz/plugin-submissions/server";
import { Miniflare } from "miniflare";
import { DEFAULT_REPORTS_PER_HOUR } from "../src/index";
import { PERMISSIONS } from "../src/permissions";
import type { BuildData, ModerationServerOptions } from "../src/server";
import { ORIGIN, PAGES } from "./data";

export { ADA, ALAN, GRACE, ORIGIN, PAGES } from "./data";

const AUTH = "/notes/_svartz/auth";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";

/** What annotations and submissions declare, as auth collects it when they're on the vault. */
const OTHERS: PermissionDeclaration[] = [
  { slug: "annotations:comments:write", name: "Comment", description: "Post comments.", defaults: { "signed-in": "allow" } },
  { slug: "annotations:comments:delete", name: "Delete any comment", description: "Delete anyone's comments." },
  { slug: "submissions:reviews:write", name: "Review submissions", description: "Comment on, review, merge and close submissions." },
];

export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<Array<{ results: unknown[] }>>;
}
interface Statement {
  bind(...values: unknown[]): Statement;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<unknown>;
}

/** A fresh, empty D1 database. */
export async function createDatabase() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["DB"] });
  const db = await miniflare.getD1Database("DB") as unknown as Database;
  return { db, dispose: () => miniflare.dispose() };
}

export interface SiteOptions {
  /** The vault's id. */
  readonly vault?: string;
  /** Leave annotations or submissions off the vault. */
  readonly annotations?: boolean;
  readonly submissions?: boolean;
  readonly reportsPerHour?: number;
  /** Bind no `SVARTZ_DB`, so nobody has an account. */
  readonly accounts?: boolean;
  /** The binding annotations keeps comments in. Default `SVARTZ_DB`. */
  readonly comments?: string;
  /** The pages the build published. Default {@link PAGES}. */
  readonly pages?: BuildData["pages"];
  /** Identity ids config names admins. */
  readonly admins?: readonly string[];
}

/**
 * One vault at /notes with `auth`, `annotations` (comments in `SVARTZ_DB`) and `moderation`, all on `db`, answering
 * like the deployed Worker. The build published {@link PAGES}, and the vault has submissions on `wikiplace/wikiplace.live`.
 */
export function createSite(db: Database, {
  vault = "notes", annotations = true, submissions = true, reportsPerHour = DEFAULT_REPORTS_PER_HOUR, accounts = true, comments = "SVARTZ_DB", pages = PAGES,
  admins = [],
}: SiteOptions = {}) {
  const data: BuildData = {
    pages,
    ...annotations && { annotations: { database: comments } },
    ...submissions && { submissions: { repo: SUBMISSIONS.repo, records: { database: "DB", root: SUBMISSIONS.root } } },
  };
  const options: ModerationServerOptions = { limits: { reportsPerHour } };
  const server = createServer({
    basePath: "/notes",
    vault: { id: vault, mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard"], load: () => import("@svartz/auth/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          permissions: [...PERMISSIONS, ...OTHERS],
          admins,
        },
        data: { permissions: [], paths: [] },
      },
      ...annotations ? [{ id: "annotations", load: () => import("@svartz/plugin-annotations/server"), options: { database: { env: comments }, reactions: [], moderators: [], limits: { writesPerHour: 30 } } }] : [],
      { id: "moderation", load: () => import("../src/server"), options, data },
    ],
  }, {
    privateEnv: {
      PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", DB: db, ...accounts && { SVARTZ_DB: db },
    },
    building: false,
    dev: false,
  });
  const event = (url: string, init: RequestInit = {}) => {
    const request = new Request(new URL(url, ORIGIN), init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  return {
    /** Answer a request to the vault's plugin routes; a full URL, from the browser tests' middleware, names its own origin. */
    fetch: (path: string, init?: RequestInit) => server.handle({ event: event(path, init), resolve: async () => new Response(null, { status: 404 }) }),
    /** The plugin page at `path` as the holder of `cookie` sees it, or `undefined` for the 404. */
    page: async (path: string, cookie = ""): Promise<PageResult | undefined> => server.page(event(path, { headers: { cookie } })),
  };
}

export type Site = ReturnType<typeof createSite>;

/**
 * Sign `person` up with GitHub through auth's real routes, choosing their GitHub handle, and answer the `name=value`
 * session cookie a browser would send back.
 */
export async function signIn(site: Site, person: Identity): Promise<string> {
  const start = await site.fetch(`${AUTH}/start/github/?returnTo=%2Fnotes%2F`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const cookies = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
  const user = { id: Number(person.id.split(":")[1]), login: person.handle, name: person.name };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json(user);
    return realFetch(input, init);
  };
  try {
    const back = await site.fetch(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { headers: { cookie: cookies(start).join("; ") } });
    const pending = cookies(back).find((pair) => pair.startsWith("__Host-svartz-pending="));
    const chosen = pending
      ? await site.fetch(`${AUTH}/handle/`, { method: "POST", headers: { cookie: pending, origin: ORIGIN }, body: new URLSearchParams({ handle: person.handle! }) })
      : back;
    const session = cookies(chosen).find((pair) => pair.startsWith("__Host-svartz-session="));
    if (!session) throw new Error(`sign-in answered ${chosen.status}`);
    return session;
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Where the vault's submissions go, and where sync records its saves: the repository, and the vault's folder in it. */
export const SUBMISSIONS = { repo: "wikiplace/wikiplace.live", root: "content" } as const;

/**
 * Record that the site saved an edit for a vault at `root`, as submissions' sync does on a save: pull request `number`,
 * or with `commit` a direct commit with that SHA; `owner` is the account id that saved it, or none for a guest.
 */
export async function seedSubmission(db: Database, number: number, root: string = SUBMISSIONS.root, { owner, commit }: { owner?: string; commit?: string } = {}): Promise<void> {
  // Asking migrates submissions' schema.
  await isVaultSubmission({ DB: db }, { database: "DB", repo: SUBMISSIONS.repo, root }, number);
  await db.prepare(`INSERT INTO submissions_edits (id, scope, owner, kind, page, path, commit_sha, pull_number, url, saved_at)
    VALUES (?, ?, ?, ?, '/notes/garden/', 'content/garden.md', ?, ?, ?, '2026-11-02T00:00:00.000Z')`)
    .bind(
      crypto.randomUUID(), `${SUBMISSIONS.repo}:${root}`, owner === undefined ? null : `account:${owner}`, commit ? "commit" : "pull-request",
      commit ?? null, commit ? null : number, `https://github.com/${SUBMISSIONS.repo}/${commit ? `commit/${commit}` : `pull/${number}`}`,
    ).run();
}

/** The id of `handle`'s account, as plugins' records name it. */
export async function accountId(db: Database, handle: string): Promise<string> {
  const { results: [row] } = await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(handle).all<{ id: string }>();
  return row!.id;
}

/**
 * `db` counting its calls in `calls.count` as a Worker invocation's D1 limit does: each query one, and a whole batch
 * one. Hand `database` to the site.
 */
export function counting(db: Database) {
  const calls = { count: 0 };
  const real = new WeakMap<object, Statement>();
  const count = <T>(result: T) => (calls.count++, result);
  const statement = (prepared: Statement): Statement => {
    const wrapped: Statement = {
      bind: (...values) => statement(prepared.bind(...values)),
      all: () => count(prepared.all()),
      run: () => count(prepared.run()),
    };
    real.set(wrapped, prepared);
    return wrapped;
  };
  const database: Database = {
    prepare: (query) => statement(db.prepare(query)),
    batch: (statements) => count(db.batch(statements.map((each) => real.get(each)!))),
  };
  return { database, calls };
}

/** Grant `permission` on the vault to `handle`'s account, as an admin would on the dashboard. */
export async function grant(db: Database, handle: string, permission: string, object = "vault:notes", value = "allow"): Promise<void> {
  await db.prepare(`INSERT INTO auth_grants (actor_type, actor_id, object, permission, value, updated_at)
    SELECT 'account', id, ?, ?, ?, '2026-11-19T00:00:00.000Z' FROM auth_accounts WHERE handle = ?`).bind(object, permission, value, handle).run();
}

/** Store Grace's comment `c1` on garden, through annotations' own schema, for reports about it. */
export async function seedComment(site: Site, db: Database, grace: Identity, id = "c1"): Promise<void> {
  // Any request to annotations migrates its schema.
  await site.fetch("/notes/_svartz/annotations/?page=garden");
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO identities (id, provider, name, handle, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(grace.id, grace.provider, grace.name, grace.handle ?? null, "2026-11-01T00:00:00.000Z"),
    db.prepare(`INSERT INTO annotations (id, vault, page, kind, body, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES (?, 'notes', 'garden', 'comment', ?, 'roses', '', '', 0, 5, ?, '2026-11-02T00:00:00.000Z')`)
      .bind(id, "Cheap pills at <a href=x>spam</a>", grace.id),
  ]);
}

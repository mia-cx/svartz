/**
 * The `annotations` server plugin. Routes, under `<mount>/_svartz/annotations/`:
 * - `GET ?page=<note path>` lists the page's annotations with their authors and agreements, to anyone, and names the
 *   signed-in reader as `viewer`, with whether they moderate.
 * - `POST` with `{ kind: "comment", page, anchor, body }` stores a signed-in reader's comment and answers it, 201.
 * - `POST <id>/agree/` with `{ agreed }` sets the reader's **+1** on a comment. On a site with accounts, the comment's
 *   author gains reputation for it, and loses it again when the +1 is taken back.
 * - `DELETE <id>/` deletes an annotation and its agreements, for its author or a moderator, and answers 204.
 *   Writes need a session from `@svartz/auth` and an `Origin` header naming this site, and each spends one of the
 *   reader's `limits.writesPerHour`, counted in D1; an exhausted budget answers 429 with `retryAfter`.
 * - `POST <id>/hide/`, a form post from the dashboard, hides a comment for a moderator of its page, records it in
 *   auth's audit log in the same transaction, and redirects to the form's `returnTo`. Needs the comments kept in the
 *   accounts database, `SVARTZ_DB`. A hidden comment stays stored,
 *   for the report about it, but no list shows it and nobody can +1 it.
 *
 * On a site with accounts (`SVARTZ_DB`), commenting takes `annotations:comments:write` on the page and moderating
 * takes `annotations:comments:delete`, both checked with `can()`; the deprecated `moderators` become grants of the
 * second. Without accounts, everyone signed in may comment and `moderators` moderate, as before permissions.
 *
 * The first request that reaches the database migrates it to the plugin's schema.
 */
import type { EnvReference, ServerContext, ServerModuleFactory } from "@svartz/core";
import type { Account, Identity } from "@svartz/auth";
import {
  ACCOUNTS_DATABASE_ENV, auditIfChanged, can, linkedIdentities, migrateGrants, postReputation, readIdentity, readSignIn,
} from "@svartz/auth/server";
import { CONTEXT_LENGTH, type Anchor } from "./anchor";
import { COMMENT_MAX_LENGTH, QUOTE_MAX_LENGTH } from "./limits";
import { DELETE_COMMENTS, WRITE_COMMENTS } from "./permissions";
import {
  createComment, deleteAnnotation, findAnnotation, hideStatement, listPage, migrate, readAgreement, readComment as storedComment, readComments as storedComments, setAgreement,
  spendWrite, type Database, type ReportedComment,
} from "./store";

export type { ReportedComment } from "./store";

/** One of the site's drawn reactions. */
export interface Reaction {
  /** Lowercase letters, digits and hyphens; what the database stores. */
  readonly id: string;
  /** What screen readers announce. */
  readonly label: string;
  /** The image's URL. */
  readonly src: string;
}

/** The `annotations` plugin's options. */
export interface AnnotationsOptions {
  /** The D1 binding annotations are stored in, such as `{ env: "DB" }`. */
  readonly database: EnvReference;
  /** The site's drawn reactions, in the order readers are offered them. */
  readonly reactions?: readonly Reaction[];
  /**
   * Identity ids, such as `"github:583231"`, that may delete any annotation.
   * @deprecated On a site with accounts, each becomes a grant of `annotations:comments:delete` on the vault once its
   * owner has an account, and the grant decides from then on. Grant the permission instead.
   */
  readonly moderators?: readonly string[];
  readonly limits?: {
    /** Write attempts (comments, +1s and deletes) each signed-in reader may make per clock hour. Default 30. */
    readonly writesPerHour?: number;
  };
}

/** What the server module receives: the options with every default filled in. */
export interface AnnotationsServerOptions {
  readonly database: EnvReference;
  readonly reactions: readonly Reaction[];
  readonly moderators: readonly string[];
  readonly limits: { readonly writesPerHour: number };
}

/** Longest `page` accepted; note paths are far shorter. */
const MAX_PAGE_LENGTH = 1024;
/** Most bytes of a write body read: a full comment and quote fit several times over, even JSON-escaped. */
const MAX_REQUEST_BYTES = 32 * 1024;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  // Lists change with every write, so nothing may serve a stale copy.
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function failure(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return json({ error, message }, status, headers);
}

function isDatabase(value: unknown): value is Database {
  return typeof value === "object" && value !== null && typeof (value as Database).prepare === "function";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isPage = (value: unknown): value is string => typeof value === "string" && value !== "" && value.length <= MAX_PAGE_LENGTH;

/** The bound database, migrated, or the 503 that says which binding is missing. */
async function databaseFor(context: ServerContext, options: AnnotationsServerOptions): Promise<Database | Response> {
  const db = context.env[options.database.env];
  if (!isDatabase(db)) return failure(503, "misconfigured", `Bind a D1 database as ${options.database.env}.`);
  await migrate(db);
  return db;
}

/**
 * The body as text, read chunk by chunk, or `undefined` once it passes `MAX_REQUEST_BYTES`: the stream is cancelled
 * there and nothing more is buffered, so a body without a Content-Length can't exhaust memory.
 */
async function readText(request: Request): Promise<string | undefined> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) return undefined;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    bytes += read.value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(read.value, { stream: true });
  }
  return text + decoder.decode();
}

/** The passage a write responds to, or why it can't be stored. Positions must agree with the quote they cover. */
function readAnchor(value: unknown): Anchor | string {
  const unreadable = "Select the passage in the note you're responding to.";
  if (!isRecord(value)) return unreadable;
  const { exact, prefix, suffix, start, end } = value;
  if (typeof exact !== "string" || typeof prefix !== "string" || typeof suffix !== "string"
    || typeof start !== "number" || typeof end !== "number") return unreadable;
  if (!exact.trim() || prefix.length > CONTEXT_LENGTH || suffix.length > CONTEXT_LENGTH
    || !Number.isSafeInteger(start) || start < 0 || end - start !== exact.length) return unreadable;
  if (exact.length > QUOTE_MAX_LENGTH) return `Select up to ${QUOTE_MAX_LENGTH.toLocaleString("en-US")} characters to respond to.`;
  return { exact, prefix, suffix, start, end };
}

/** A comment to store, or the message the composer shows instead. The body is kept as plain text, never markup. */
function readComment(input: unknown): { page: string; anchor: Anchor; body: string } | string {
  if (!isRecord(input) || input.kind !== "comment") return "Send a comment as { kind: \"comment\", page, anchor, body }.";
  if (!isPage(input.page)) return "Name the note with page: <its path in the vault>.";
  if (typeof input.body !== "string") return "Write a comment before posting.";
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (!body) return "Write a comment before posting.";
  if (body.length > COMMENT_MAX_LENGTH) return `Comments can be up to ${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`;
  const anchor = readAnchor(input.anchor);
  return typeof anchor === "string" ? anchor : { page: input.page, anchor, body };
}

/** Who sent a request: the identity their annotations are stored under, and their account on a site with accounts. */
interface Reader {
  readonly identity: Identity;
  readonly account: Account | null;
}

/** The signed-in reader, or `null`. Without `SVARTZ_DB` nobody has an account, so the session's identity stands alone. */
async function readReader(request: Request, env: ServerContext["env"]): Promise<Reader | null> {
  const signIn = await readSignIn(request, env);
  if (signIn.account) return { identity: signIn.account.identity, account: signIn.account };
  if (signIn.reason !== "no-database") return null;
  const identity = await readIdentity(request, env);
  return identity && { identity, account: null };
}

/** What a reader may do on a page beyond their own annotations. */
interface Rights {
  /** Delete anyone's annotation on `page`. */
  moderates(reader: Reader, page: string, context: ServerContext): Promise<boolean>;
  /** Comment on `page`. */
  comments(reader: Reader, page: string, context: ServerContext): Promise<boolean>;
}

/**
 * Permissions on a site with accounts, and on one without, the `moderators` list and nothing else. Each listed
 * moderator becomes a grant on the vault through `migrateGrants`, which lands it once, when its owner has an account:
 * until then nobody can sign in as them, so nothing is lost by waiting.
 */
function rightsFor(options: AnnotationsServerOptions): Rights {
  // Listed moderators whose grant this isolate hasn't seen in place yet.
  let unmoved = options.moderators;
  const moveModerators = async (context: ServerContext) => {
    if (unmoved.length === 0) return;
    const pending = unmoved;
    const moved = await migrateGrants(context.env, pending.map((identity) => ({
      identity, permission: DELETE_COMMENTS, target: { vault: context.vault.id }, value: "allow" as const,
    })));
    const done = new Set(pending.filter((_, index) => moved[index]));
    unmoved = unmoved.filter((identity) => !done.has(identity));
  };
  return {
    async moderates(reader, page, context) {
      if (!reader.account) return options.moderators.includes(reader.identity.id);
      await moveModerators(context);
      return can(reader.account, DELETE_COMMENTS, { vault: context.vault.id, page }, context.env);
    },
    async comments(reader, page, context) {
      return !reader.account || can(reader.account, WRITE_COMMENTS, { vault: context.vault.id, page }, context.env);
    },
  };
}

async function list(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, rights: Rights): Promise<Response> {
  const page = url.searchParams.get("page");
  if (!isPage(page)) return failure(400, "invalid_page", "Name the note with ?page=<its path in the vault>.");
  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const reader = await readReader(request, context.env);
  return json({
    annotations: await listPage(db, context.vault.id, page),
    viewer: reader && { id: reader.identity.id, moderator: await rights.moderates(reader, page, context) },
  });
}

/** What a write route tells the reader when its request can't be read. */
interface WriteMessages {
  readonly signedOut: string;
  readonly tooLarge: string;
  readonly notJson: string;
}

const unit = (name: "second" | "minute" | "hour", value: number) =>
  new Intl.NumberFormat("en", { style: "unit", unit: name, unitDisplay: "long" }).format(value);

/** Round up in the largest unit, so the reader is never told to retry too early. */
function inWords(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return unit("second", seconds);
  if (seconds < SECONDS_PER_HOUR) return unit("minute", Math.ceil(seconds / SECONDS_PER_MINUTE));
  return unit("hour", Math.ceil(seconds / SECONDS_PER_HOUR));
}

/**
 * The signed-in reader behind a write, the JSON they sent (`undefined` when they sent none) and the migrated database,
 * or the refusal: another site, no session, no database, an exhausted write budget, a body over `MAX_REQUEST_BYTES`, or
 * one that isn't JSON. The budget is spent before the body is read, so invalid attempts count too.
 */
async function readWrite(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, messages: WriteMessages): Promise<{ reader: Reader; input: unknown; db: Database } | Response> {
  // Browsers name the page's origin on every POST and DELETE, so a missing or foreign one is another site, or no browser at all.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Post from this site.");
  const reader = await readReader(request, context.env);
  if (!reader) return failure(401, "signed_out", messages.signedOut);
  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const retryAfter = await spendWrite(db, reader.identity.id, options.limits.writesPerHour);
  if (retryAfter !== undefined) {
    return json({ error: "rate_limited", message: `You've sent too many annotations. Try again in ${inWords(retryAfter)}.`, retryAfter }, 429, {
      "retry-after": String(retryAfter),
    });
  }

  const text = await readText(request);
  if (text === undefined) return failure(413, "too_large", messages.tooLarge);
  try {
    return { reader, input: text === "" ? undefined : JSON.parse(text), db };
  } catch {
    return failure(400, "invalid_json", messages.notJson);
  }
}

async function create(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, rights: Rights): Promise<Response> {
  const write = await readWrite(request, url, context, options, {
    signedOut: "Sign in to comment.",
    tooLarge: "This comment is too long to post.",
    notJson: "Send the comment as JSON.",
  });
  if (write instanceof Response) return write;
  const comment = readComment(write.input);
  if (typeof comment === "string") return failure(400, "invalid_annotation", comment);
  if (!await rights.comments(write.reader, comment.page, context)) return failure(403, "forbidden", "You can't comment on this page.");
  return json({ annotation: await createComment(write.db, { vault: context.vault.id, ...comment, author: write.reader.identity }) }, 201);
}

/** `{ agreed }` sets the reader's **+1** on comment `id`, and answers `{ agreed, agreements }` with every agreement after it. */
async function agree(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, id: string): Promise<Response> {
  const write = await readWrite(request, url, context, options, {
    signedOut: "Sign in to +1 a comment.",
    tooLarge: "Send only { agreed } to +1 a comment.",
    notJson: "Send the +1 as JSON.",
  });
  if (write instanceof Response) return write;
  const { input, reader: { identity: author }, db } = write;
  if (!isRecord(input) || typeof input.agreed !== "boolean") {
    return failure(400, "invalid_agreement", "Send { agreed: true } to +1 a comment, or { agreed: false } to take it back.");
  }
  const agreements = await setAgreement(db, { vault: context.vault.id, annotation: id, author, agreed: input.agreed });
  if (agreements === "missing") return failure(404, "not_found", "This comment has been deleted.");
  if (agreements === "reaction") return failure(400, "invalid_agreement", "Only comments take a +1.");
  if (write.reader.account) {
    await creditAgreement(db, context, id, write.reader.account).catch((error: unknown) => {
      // The +1 stands; its reputation follows the next time this reader changes it.
      console.error("[annotations] couldn't post reputation for a +1", error);
    });
  }
  return json({ agreed: input.agreed, agreements });
}

/**
 * Give the comment's author reputation for `account`'s +1, or take it back, as whether any sign-in linked to `account`
 * agrees with it now. One account scores a comment once, however many of its sign-ins +1 it, and auth credits nobody
 * for agreeing with their own comment, from any of their sign-ins. The comment's agreement version goes with it, so a
 * request that read the +1 before a racing change settles nothing over that change.
 */
async function creditAgreement(db: Database, context: ServerContext, annotation: string, account: Account): Promise<void> {
  const identities = (await linkedIdentities(account, context.env)).map(({ id }) => id);
  const agreement = await readAgreement(db, context.vault.id, annotation, identities);
  if (!agreement) return;
  await postReputation(context.env, {
    kind: "agreement",
    to: { identity: agreement.author },
    ref: `annotations:${context.vault.id}:${annotation}:${account.id}`,
    from: account.id,
    agreed: agreement.agreed,
    version: agreement.version,
  });
}

/**
 * Delete annotation `id` and its agreements, for its author or a moderator of its page, answering 204. An id this vault
 * doesn't have answers 404, so a retried delete finds the annotation already gone.
 */
async function remove(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, rights: Rights, id: string): Promise<Response> {
  const write = await readWrite(request, url, context, options, {
    signedOut: "Sign in to delete a comment.",
    tooLarge: "Send a delete without a body.",
    notJson: "Send a delete without a body.",
  });
  if (write instanceof Response) return write;
  const target = await findAnnotation(write.db, context.vault.id, id);
  if (!target) return failure(404, "not_found", "This comment has been deleted.");
  if (target.author !== write.reader.identity.id && !await rights.moderates(write.reader, target.page, context)) {
    return failure(403, "forbidden", "Only its author or a moderator can delete this comment.");
  }
  await deleteAnnotation(write.db, context.vault.id, id);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

/**
 * Comment `id` of `vault`, hidden or not, from the annotations stored in the D1 binding named `database`: what the
 * moderation plugin shows beside a report about it. `undefined` when there's no such comment, or no such binding.
 */
export async function findComment(env: ServerContext["env"], database: string, vault: string, id: string): Promise<ReportedComment | undefined> {
  const db = env[database];
  if (!isDatabase(db)) return undefined;
  await migrate(db);
  return storedComment(db, vault, id);
}

/**
 * {@link findComment} for each of `ids` in one query, by id, for a list of reports: ids with no such comment are absent,
 * and so is every id when there's no such binding.
 */
export async function findComments(env: ServerContext["env"], database: string, vault: string, ids: readonly string[]): Promise<Map<string, ReportedComment>> {
  const db = env[database];
  if (!isDatabase(db) || ids.length === 0) return new Map();
  await migrate(db);
  return storedComments(db, vault, ids);
}

/**
 * `returnTo` when it's a path on this site, else the vault's home. Checked after normalizing too: dot segments can fold
 * a path like `/a/..//evil.test/` into `//evil.test/`, which a browser reads as another site.
 */
function sameSitePath(returnTo: string | null, url: URL, context: ServerContext): string {
  const home = `${context.base.slice(0, -"/_svartz/annotations".length)}/`;
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) return home;
  const target = new URL(returnTo, url.origin);
  if (target.origin !== url.origin || target.pathname.startsWith("//")) return home;
  return `${target.pathname}${target.search}${target.hash}`;
}

/**
 * `POST <id>/hide/`: hide comment `id` for a moderator of its page, record who did in auth's audit log, and redirect to
 * the form's `returnTo`. Needs the comments kept in the accounts database, so the hide and its entry commit together.
 * Hiding a hidden comment, or one deleted on the way, changes and records nothing.
 */
async function hide(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions, id: string): Promise<Response> {
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Post from this site.");
  if (options.database.env !== ACCOUNTS_DATABASE_ENV) {
    return failure(503, "misconfigured", `Hiding comments needs annotations to keep its comments in ${ACCOUNTS_DATABASE_ENV}: set database: { env: "${ACCOUNTS_DATABASE_ENV}" }.`);
  }
  const signIn = await readSignIn(request, context.env);
  if (signIn.reason === "no-database") return failure(503, "misconfigured", `Hiding comments needs accounts: bind a D1 database as ${ACCOUNTS_DATABASE_ENV}.`);
  const account = signIn.account;
  if (!account) return failure(401, "signed_out", "Sign in to hide a comment.");
  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const comment = await storedComment(db, context.vault.id, id);
  if (!comment) return failure(404, "not_found", "This comment has been deleted.");
  if (!await can(account, DELETE_COMMENTS, { vault: context.vault.id, page: comment.page }, context.env)) {
    return failure(403, "forbidden", "Only a moderator can hide this comment.");
  }
  const text = await readText(request);
  if (text === undefined) return failure(413, "too_large", "Send only returnTo to hide a comment.");
  const returnTo = sameSitePath(new URLSearchParams(text).get("returnTo"), url, context);
  const back = new Response(null, { status: 303, headers: { location: returnTo, "cache-control": "no-store" } });
  if (comment.hidden) return back;
  const entry = { actor: account, action: "annotations:comment:hide", target: `annotation:${id}`, detail: { vault: context.vault.id, page: comment.page } };
  // Another moderator may have hidden it since the read above, or its author deleted it: the hide then inserts nothing,
  // and the entry follows the hide, so the write decides.
  await db.batch([hideStatement(db, context.vault.id, id, new Date().toISOString()), auditIfChanged(db, entry)]);
  return back;
}

/** `/<annotation id>/`, below the plugin's base. */
const ANNOTATION_PATH = /^\/([^/]+)\/$/;
/** `/<annotation id>/agree/`, below the plugin's base. */
const AGREE_PATH = /^\/([^/]+)\/agree\/$/;
/** `/<annotation id>/hide/`, below the plugin's base. */
const HIDE_PATH = /^\/([^/]+)\/hide\/$/;

/** The `annotations` server module: `server: { module, options }` with {@link AnnotationsServerOptions}. */
const annotationsServer: ServerModuleFactory<AnnotationsServerOptions> = (options) => {
  const rights = rightsFor(options);
  return async (request, context) => {
    const url = new URL(request.url);
    const path = url.pathname.slice(context.base.length);
    if (path === "/") {
      if (request.method === "GET") return list(request, url, context, options, rights);
      if (request.method === "POST") return create(request, url, context, options, rights);
      return failure(405, "method_not_allowed", "Use GET or POST.", { allow: "GET, POST" });
    }
    const annotation = ANNOTATION_PATH.exec(path);
    if (annotation) {
      if (request.method !== "DELETE") return failure(405, "method_not_allowed", "Use DELETE.", { allow: "DELETE" });
      return remove(request, url, context, options, rights, annotation[1]!);
    }
    const hiding = HIDE_PATH.exec(path);
    if (hiding) {
      if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
      return hide(request, url, context, options, hiding[1]!);
    }
    const agreeing = AGREE_PATH.exec(path);
    if (!agreeing) return undefined;
    if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
    return agree(request, url, context, options, agreeing[1]!);
  };
};

export default annotationsServer;

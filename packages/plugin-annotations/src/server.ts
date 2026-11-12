/**
 * The `annotations` server plugin. Routes, under `<mount>/_svartz/annotations/`:
 * - `GET ?page=<note path>` lists the page's annotations with their authors and agreements, to anyone, and names the
 *   signed-in reader as `viewer`, with whether they moderate.
 * - `POST` with `{ kind: "comment", page, anchor, body }` stores a signed-in reader's comment and answers it, 201.
 * - `POST <id>/agree/` with `{ agreed }` sets the reader's **+1** on a comment.
 * - `DELETE <id>/` deletes an annotation and its agreements, for its author or a moderator, and answers 204.
 *   Writes need a session from `@svartz/auth` and an `Origin` header naming this site.
 *
 * The first request that reaches the database migrates it to the plugin's schema.
 */
import type { EnvReference, ServerContext, ServerModuleFactory } from "@svartz/core";
import type { Identity } from "@svartz/auth";
import { readIdentity } from "@svartz/auth/server";
import { CONTEXT_LENGTH, type Anchor } from "./anchor";
import { COMMENT_MAX_LENGTH, QUOTE_MAX_LENGTH } from "./limits";
import { createWriteLimit } from "./guard";
import { createComment, deleteAnnotation, listPage, migrate, setAgreement, type Database } from "./store";

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
  /** Identity ids, such as `"github:583231"`, that may delete any annotation. */
  readonly moderators?: readonly string[];
  readonly limits?: {
    /** Write attempts (including deletes) each signed-in reader may make per hour in the memory fallback. Default 30. */
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

async function list(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions): Promise<Response> {
  const page = url.searchParams.get("page");
  if (!isPage(page)) return failure(400, "invalid_page", "Name the note with ?page=<its path in the vault>.");
  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const reader = await readIdentity(request, context.env);
  return json({
    annotations: await listPage(db, context.vault.id, page),
    viewer: reader && { id: reader.id, moderator: options.moderators.includes(reader.id) },
  });
}

/** What a write route tells the reader when its request can't be read. */
interface WriteMessages {
  readonly signedOut: string;
  readonly tooLarge: string;
  readonly notJson: string;
}

type WriteContext = ServerContext & { readonly checkLimit: ReturnType<typeof createWriteLimit> };

/**
 * The signed-in reader behind a write and the JSON they sent, `undefined` when they sent none, or the refusal: another
 * site, no session, an exhausted write budget, a body over `MAX_REQUEST_BYTES`, or one that isn't JSON. Count before
 * reading the body, so invalid attempts spend the reader's budget too.
 */
async function readWrite(request: Request, url: URL, context: WriteContext, messages: WriteMessages): Promise<{ author: Identity; input: unknown } | Response> {
  // Browsers name the page's origin on every POST and DELETE, so a missing or foreign one is another site, or no browser at all.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Post from this site.");
  const author = await readIdentity(request, context.env);
  if (!author) return failure(401, "signed_out", messages.signedOut);
  const refusal = await context.checkLimit(author.id, context.env);
  if (refusal) return refusal;

  const text = await readText(request);
  if (text === undefined) return failure(413, "too_large", messages.tooLarge);
  try {
    return { author, input: text === "" ? undefined : JSON.parse(text) };
  } catch {
    return failure(400, "invalid_json", messages.notJson);
  }
}

async function create(request: Request, url: URL, context: WriteContext, options: AnnotationsServerOptions): Promise<Response> {
  const write = await readWrite(request, url, context, {
    signedOut: "Sign in to comment.",
    tooLarge: "This comment is too long to post.",
    notJson: "Send the comment as JSON.",
  });
  if (write instanceof Response) return write;
  const comment = readComment(write.input);
  if (typeof comment === "string") return failure(400, "invalid_annotation", comment);

  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  return json({ annotation: await createComment(db, { vault: context.vault.id, ...comment, author: write.author }) }, 201);
}

/** `{ agreed }` sets the reader's **+1** on comment `id`, and answers `{ agreed, agreements }` with every agreement after it. */
async function agree(request: Request, url: URL, context: WriteContext, options: AnnotationsServerOptions, id: string): Promise<Response> {
  const write = await readWrite(request, url, context, {
    signedOut: "Sign in to +1 a comment.",
    tooLarge: "Send only { agreed } to +1 a comment.",
    notJson: "Send the +1 as JSON.",
  });
  if (write instanceof Response) return write;
  const { input, author } = write;
  if (!isRecord(input) || typeof input.agreed !== "boolean") {
    return failure(400, "invalid_agreement", "Send { agreed: true } to +1 a comment, or { agreed: false } to take it back.");
  }

  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const agreements = await setAgreement(db, { vault: context.vault.id, annotation: id, author, agreed: input.agreed });
  if (agreements === "missing") return failure(404, "not_found", "This comment has been deleted.");
  if (agreements === "reaction") return failure(400, "invalid_agreement", "Only comments take a +1.");
  return json({ agreed: input.agreed, agreements });
}

/**
 * Delete annotation `id` and its agreements, for its author or a moderator, answering 204. An id this vault doesn't
 * have answers 404, so a retried delete finds the annotation already gone.
 */
async function remove(request: Request, url: URL, context: WriteContext, options: AnnotationsServerOptions, id: string): Promise<Response> {
  const write = await readWrite(request, url, context, {
    signedOut: "Sign in to delete a comment.",
    tooLarge: "Send a delete without a body.",
    notJson: "Send a delete without a body.",
  });
  if (write instanceof Response) return write;

  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  const { id: by } = write.author;
  const deleted = await deleteAnnotation(db, { vault: context.vault.id, annotation: id, by, moderator: options.moderators.includes(by) });
  if (deleted === "missing") return failure(404, "not_found", "This comment has been deleted.");
  if (deleted === "forbidden") return failure(403, "forbidden", "Only its author or a moderator can delete this comment.");
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

/** `/<annotation id>/`, below the plugin's base. */
const ANNOTATION_PATH = /^\/([^/]+)\/$/;
/** `/<annotation id>/agree/`, below the plugin's base. */
const AGREE_PATH = /^\/([^/]+)\/agree\/$/;

/** The `annotations` server module: `server: { module, options }` with {@link AnnotationsServerOptions}. */
const annotationsServer: ServerModuleFactory<AnnotationsServerOptions> = (options) => {
  const checkLimit = createWriteLimit(options.limits.writesPerHour);
  return async (request, serverContext) => {
    const context: WriteContext = { ...serverContext, checkLimit };
    const url = new URL(request.url);
    const path = url.pathname.slice(context.base.length);
    if (path === "/") {
      if (request.method === "GET") return list(request, url, context, options);
      if (request.method === "POST") return create(request, url, context, options);
      return failure(405, "method_not_allowed", "Use GET or POST.", { allow: "GET, POST" });
    }
    const annotation = ANNOTATION_PATH.exec(path);
    if (annotation) {
      if (request.method !== "DELETE") return failure(405, "method_not_allowed", "Use DELETE.", { allow: "DELETE" });
      return remove(request, url, context, options, annotation[1]!);
    }
    const agreeing = AGREE_PATH.exec(path);
    if (!agreeing) return undefined;
    if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
    return agree(request, url, context, options, agreeing[1]!);
  };
};

export default annotationsServer;

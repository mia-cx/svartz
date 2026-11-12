/**
 * The `annotations` server plugin. Routes, under `<mount>/_svartz/annotations/`:
 * - `GET ?page=<note path>` lists the page's annotations with their authors and agreements, to anyone.
 * - `POST` with `{ kind: "comment", page, anchor, body }` stores a signed-in reader's comment and answers it, 201.
 *   Writes need a session from `@svartz/auth` and an `Origin` header naming this site.
 *
 * The first request that reaches the database migrates it to the plugin's schema.
 */
import type { EnvReference, ServerContext, ServerModuleFactory } from "@svartz/core";
import { readIdentity } from "@svartz/auth/server";
import { CONTEXT_LENGTH, type Anchor } from "./anchor";
import { COMMENT_MAX_LENGTH, QUOTE_MAX_LENGTH } from "./limits";
import { createComment, listPage, migrate, type Database } from "./store";

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
    /** Comments, reactions and agreements each signed-in reader may write per hour. Default 30. */
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

async function list(url: URL, context: ServerContext, options: AnnotationsServerOptions): Promise<Response> {
  const page = url.searchParams.get("page");
  if (!isPage(page)) return failure(400, "invalid_page", "Name the note with ?page=<its path in the vault>.");
  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  return json({ annotations: await listPage(db, context.vault.id, page) });
}

async function create(request: Request, url: URL, context: ServerContext, options: AnnotationsServerOptions): Promise<Response> {
  // Browsers name the page's origin on every POST, so a missing or foreign one is another site, or no browser at all.
  if (request.headers.get("origin") !== url.origin) return failure(403, "cross_origin", "Post from this site.");
  const author = await readIdentity(request, context.env);
  if (!author) return failure(401, "signed_out", "Sign in to comment.");

  const text = await readText(request);
  if (text === undefined) return failure(413, "too_large", "This comment is too long to post.");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return failure(400, "invalid_json", "Send the comment as JSON.");
  }
  const comment = readComment(input);
  if (typeof comment === "string") return failure(400, "invalid_annotation", comment);

  const db = await databaseFor(context, options);
  if (db instanceof Response) return db;
  return json({ annotation: await createComment(db, { vault: context.vault.id, ...comment, author }) }, 201);
}

/** The `annotations` server module: `server: { module, options }` with {@link AnnotationsServerOptions}. */
const annotationsServer: ServerModuleFactory<AnnotationsServerOptions> = (options) => async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname.slice(context.base.length) !== "/") return undefined;
  if (request.method === "GET") return list(url, context, options);
  if (request.method === "POST") return create(request, url, context, options);
  return failure(405, "method_not_allowed", "Use GET or POST.", { allow: "GET, POST" });
};

export default annotationsServer;

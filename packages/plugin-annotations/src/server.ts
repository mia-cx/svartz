/**
 * The `annotations` server plugin. Routes, under `<mount>/_svartz/annotations/`:
 * - `GET ?page=<note path>` lists the page's annotations with their authors and agreements, to anyone.
 *
 * The first request migrates the D1 database to the plugin's schema.
 */
import type { EnvReference, ServerModuleFactory } from "@svartz/core";
import { listPage, migrate, type Database } from "./store";

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

/** The `annotations` server module: `server: { module, options }` with {@link AnnotationsServerOptions}. */
const annotationsServer: ServerModuleFactory<AnnotationsServerOptions> = (options) => async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname.slice(context.base.length) !== "/") return undefined;
  if (request.method !== "GET") return failure(405, "method_not_allowed", "Use GET.", { allow: "GET" });

  const page = url.searchParams.get("page");
  if (!page || page.length > MAX_PAGE_LENGTH) {
    return failure(400, "invalid_page", "Name the note with ?page=<its path in the vault>.");
  }
  const db = context.env[options.database.env];
  if (!isDatabase(db)) {
    return failure(503, "misconfigured", `Bind a D1 database as ${options.database.env}.`);
  }

  await migrate(db);
  return json({ annotations: await listPage(db, context.vault.id, page) });
};

export default annotationsServer;

/**
 * The `moderation` server plugin. Routes, under `<mount>/_svartz/moderation/`:
 * - `POST reports/` with `{ target: { kind, id }, reason }` files a signed-in reader's report and answers 201 with
 *   `{ report: { id } }`. It takes `moderation:reports:write` on the vault and an `Origin` header naming this site,
 *   and spends one of the reader's `limits.reportsPerHour`; an exhausted budget answers 429 with `retryAfter`.
 * - `POST reports/<id>/resolve/` and `POST reports/<id>/dismiss/`, form posts from the Reports panel, close an open
 *   report for an account holding `moderation:reports:read` on the vault, record it in auth's audit log, and redirect
 *   back to the panel.
 *
 * The dashboard's Reports panel (`panel.ts`) lists the queue. Reports need accounts: without `SVARTZ_DB` every route
 * answers 503. The first request that reaches the database migrates it to the plugin's schema.
 */
import { ACCOUNTS_DATABASE_ENV, audit, can, readSignIn, type Account } from "@svartz/auth/server";
import type { EnvReference, ServerContext, ServerModuleFactory } from "@svartz/core";
import { REASON_MAX_LENGTH } from "./api";
import { panelPath, reportsPanel } from "./panel";
import { READ_REPORTS, WRITE_REPORTS } from "./permissions";
import { closeStatement, fileReport, findReport, migrate, reopen, spendReport, type Database } from "./store";
import { checkTarget, type BuildData } from "./targets";

export type { BuildData } from "./targets";

/** The `moderation` plugin's options. */
export interface ModerationOptions {
  /** The D1 binding reports are stored in, such as `{ env: "DB" }`; it may be `SVARTZ_DB`, auth's own. */
  readonly database: EnvReference;
  readonly limits?: {
    /** Reports each signed-in reader may send per clock hour. Default 10. */
    readonly reportsPerHour?: number;
  };
}

/** What the server module receives: the options with every default filled in. */
export interface ModerationServerOptions {
  readonly database: EnvReference;
  readonly limits: { readonly reportsPerHour: number };
}

/** Most bytes of a report's body read: the longest reason and target fit several times over, even JSON-escaped. */
const MAX_REQUEST_BYTES = 16 * 1024;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function failure(status: number, error: string, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error, message }, { status, headers: { "cache-control": "no-store", ...headers } });
}

const isDatabase = (value: unknown): value is Database =>
  typeof value === "object" && value !== null && typeof (value as Database).prepare === "function";

/** The body as text, or `undefined` once it passes `MAX_REQUEST_BYTES`: the stream is cancelled there. */
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

const unit = (name: "second" | "minute" | "hour", value: number) =>
  new Intl.NumberFormat("en", { style: "unit", unit: name, unitDisplay: "long" }).format(value);

/** Round up in the largest unit, so the reader is never told to retry too early. */
function inWords(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return unit("second", seconds);
  if (seconds < SECONDS_PER_HOUR) return unit("minute", Math.ceil(seconds / SECONDS_PER_MINUTE));
  return unit("hour", Math.ceil(seconds / SECONDS_PER_HOUR));
}

/** A reason as stored: plain text, its line breaks normalised and its ends trimmed; or what's wrong with it. */
function readReason(value: unknown): string | { message: string } {
  if (typeof value !== "string" || !value.trim()) return { message: "Say what's wrong before sending." };
  const reason = value.replace(/\r\n?/g, "\n").trim();
  if (reason.length > REASON_MAX_LENGTH) return { message: `Keep the reason to ${REASON_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  return reason;
}

/**
 * The signed-in account behind a write from this site, and the migrated database, or the refusal: another site, no
 * accounts, no session, or no database.
 */
async function writer(request: Request, context: ServerContext, database: string, signedOut: string): Promise<{ account: Account; db: Database } | Response> {
  // Browsers name the page's origin on every POST, so a missing or foreign one is another site, or no browser at all.
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure(403, "cross_origin", "Post from this site.");
  const signIn = await readSignIn(request, context.env);
  if (signIn.reason === "no-database") return failure(503, "misconfigured", `Reports need accounts: bind a D1 database as ${ACCOUNTS_DATABASE_ENV}.`);
  if (!signIn.account) return failure(401, "signed_out", signedOut);
  const db = context.env[database];
  if (!isDatabase(db)) return failure(503, "misconfigured", `Bind a D1 database as ${database} to keep reports.`);
  await migrate(db);
  return { account: signIn.account, db };
}

/** The `moderation` server module: `server: { module, options }` with {@link ModerationServerOptions} and the build's {@link BuildData}. */
const moderationServer: ServerModuleFactory<ModerationServerOptions, BuildData> = (options, data) => {
  const database = options.database.env;

  async function file(request: Request, context: ServerContext): Promise<Response> {
    const write = await writer(request, context, database, "Sign in to report.");
    if (write instanceof Response) return write;
    const { account, db } = write;
    if (!await can(account, WRITE_REPORTS, { vault: context.vault.id }, context.env)) return failure(403, "forbidden", "Your account can't send reports here.");
    // Spent before the body is read, so malformed attempts count too.
    const retryAfter = await spendReport(db, account.id, options.limits.reportsPerHour);
    if (retryAfter !== undefined) {
      return Response.json({ error: "rate_limited", message: `You've sent a lot of reports. Try again in ${inWords(retryAfter)}.`, retryAfter }, {
        status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryAfter) },
      });
    }
    const text = await readText(request);
    if (text === undefined) return failure(413, "too_large", "This report is too long to send.");
    let input: { target?: unknown; reason?: unknown };
    try {
      input = JSON.parse(text) ?? {};
    } catch {
      return failure(400, "invalid_json", "Send the report as JSON.");
    }
    const reason = readReason(input.reason);
    if (typeof reason !== "string") return failure(400, "invalid_reason", reason.message);
    const target = await checkTarget(input.target, context, data);
    if ("status" in target) return failure(target.status, target.error, target.message);
    const id = await fileReport(db, { vault: context.vault.id, target, reason, reporter: account.id });
    return Response.json({ report: { id } }, { status: 201, headers: { "cache-control": "no-store" } });
  }

  /** Close report `id` as `state` for a moderator, recording it, and go back to the panel at the report. */
  async function decide(request: Request, context: ServerContext, id: string, state: "resolved" | "dismissed"): Promise<Response> {
    const write = await writer(request, context, database, "Sign in to handle reports.");
    if (write instanceof Response) return write;
    const { account, db } = write;
    if (!await can(account, READ_REPORTS, { vault: context.vault.id }, context.env)) return failure(403, "forbidden", "Your account can't handle reports here.");
    const report = await findReport(db, context.vault.id, id);
    if (!report) return failure(404, "not_found", "There's no such report.");
    const back = (status: string) => new Response(null, {
      status: 303, headers: { location: `${panelPath(context)}?status=${status}#report-${id}`, "cache-control": "no-store" },
    });
    if (report.state !== "open") return back("already-closed");
    const closing = { vault: context.vault.id, id, state, by: account.handle, at: new Date().toISOString() };
    const entry = {
      actor: account,
      action: `moderation:report:${state === "resolved" ? "resolve" : "dismiss"}`,
      target: `report:${id}`,
      detail: { vault: context.vault.id, target: `${report.target.kind}:${report.target.id}` },
    };
    // Another moderator may have closed it since the read above. The close itself fails then, so the write decides.
    const shared = database === ACCOUNTS_DATABASE_ENV;
    try {
      // In the accounts database the close and its entry commit together; anywhere else the close lands first.
      if (shared) await audit(context.env, entry, [closeStatement(db, closing)]);
      else await closeStatement(db, closing).run();
    } catch (error) {
      if ((await findReport(db, context.vault.id, id))?.state !== "open") return back("already-closed");
      throw error;
    }
    if (!shared) {
      await audit(context.env, entry).catch(async (error: unknown) => {
        await reopen(db, closing);
        throw error;
      });
    }
    return back(state);
  }

  return {
    dashboard: { title: "Moderation", panels: [reportsPanel(data, database)] },
    handle: async (request, context) => {
      const path = new URL(request.url).pathname.slice(context.base.length);
      // Report ids are UUIDs.
      const decision = /^\/reports\/([0-9a-f-]{36})\/(resolve|dismiss)\/$/.exec(path);
      if (path !== "/reports/" && !decision) return undefined;
      if (request.method !== "POST") return failure(405, "method_not_allowed", "Use POST.", { allow: "POST" });
      if (!decision) return file(request, context);
      return decide(request, context, decision[1]!, decision[2] === "resolve" ? "resolved" : "dismissed");
    },
  };
};

export default moderationServer;

/**
 * The submissions server module, mounted at `<base><mount>/_svartz/submissions/`:
 *
 * - `GET source/?page=<route>` answers `{ markdown }`, the note's source at the build commit.
 * - `POST edit/` with `{ page, markdown, note?, turnstileToken? }` opens a pull request and answers 201 `{ url, number }`.
 *
 * Only notes in the build's manifest can be read or edited; the client never names a file path. Every edit passes
 * the guard (rate limit, and Turnstile when configured) before any GitHub call.
 * Failures answer `{ error, message }`.
 */
import { readIdentity } from "@svartz/auth/server";
import type { ServerContext, ServerModuleFactory } from "@svartz/core";
import {
  MAX_MARKDOWN_BYTES,
  MAX_NOTE_LENGTH,
  PLUGIN_ID,
  type EditRequest,
  type EditResponse,
  type SourceResponse,
} from "./api";
import { SubmissionError } from "./errors";
import { openSubmission, readSource, type GitHubTarget } from "./github";
import { createGuard, type GuardOptions } from "./guard";

/** The plugin's server options, as written into the server bundle. */
export interface ServerOptions {
  readonly repo: string;
  readonly branch?: string;
  readonly labels: readonly string[];
  readonly token: { readonly env: string };
  readonly guard: GuardOptions;
}

/** What the build records for the server: never sent to the browser. */
export interface BuildData {
  /** The commit the site was built from. */
  readonly commit: string;
  /** Each editable note's route below the deployment base, mapped to its repository-relative path. */
  readonly pages: Readonly<Record<string, string>>;
}

/** Room for a full note, the longest note and the JSON around them. */
const MAX_REQUEST_BYTES = MAX_MARKDOWN_BYTES + MAX_NOTE_LENGTH * 4 + 4096;
const encoder = new TextEncoder();
const tooLarge = () => new SubmissionError("too_large", 413, "This page is too large to submit from the site.");

/**
 * The body as text, read chunk by chunk: past `MAX_REQUEST_BYTES` the stream is cancelled and nothing more is
 * buffered, so a body without a Content-Length can't exhaust memory.
 */
async function readText(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) throw tooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    bytes += read.value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(read.value, { stream: true });
  }
  return text + decoder.decode();
}

const submissions: ServerModuleFactory<ServerOptions, BuildData> = (options, data) => {
  const pages = new Map(Object.entries(data.pages));
  const guard = createGuard(options.guard);

  function notePath(page: string | null): string {
    const path = page === null ? undefined : pages.get(page);
    if (!path) throw new SubmissionError("not_editable", 404, "This page can't be edited from the site.");
    return path;
  }

  function target(context: ServerContext): GitHubTarget {
    const token = context.env[options.token.env];
    if (typeof token !== "string" || !token) {
      throw new SubmissionError(
        "misconfigured",
        503,
        `This site can't open pull requests yet: its server has no ${options.token.env} set.`,
      );
    }
    return { repo: options.repo, token, branch: options.branch, labels: options.labels, commit: data.commit };
  }

  async function source(request: Request, context: ServerContext): Promise<Response> {
    const path = notePath(new URL(request.url).searchParams.get("page"));
    const markdown = await readSource(target(context), path);
    return Response.json({ markdown } satisfies SourceResponse);
  }

  async function readEdit(request: Request): Promise<EditRequest & { readonly note: string }> {
    const text = await readText(request);
    let body: Partial<Record<keyof EditRequest, unknown>> | null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const { page, markdown, note = "", turnstileToken } = body ?? {};
    if (
      typeof page !== "string" || typeof markdown !== "string" || typeof note !== "string"
      || (turnstileToken !== undefined && typeof turnstileToken !== "string")
    ) {
      throw new SubmissionError("invalid_request", 400, "The edit didn't arrive intact. Reload the page and try again.");
    }
    if (encoder.encode(markdown).byteLength > MAX_MARKDOWN_BYTES) throw tooLarge();
    if (note.length > MAX_NOTE_LENGTH) {
      throw new SubmissionError("note_too_long", 400, `Shorten the note to ${MAX_NOTE_LENGTH.toLocaleString("en")} characters or fewer.`);
    }
    return { page, markdown, note, turnstileToken };
  }

  async function edit(request: Request, context: ServerContext): Promise<Response> {
    const { page, markdown, note, turnstileToken } = await readEdit(request);
    const path = notePath(page);
    await guard({
      token: turnstileToken,
      identity: await readIdentity(request, context.env),
      clientAddress: context.clientAddress,
      env: context.env,
    });
    // The page's public URL: the deployment base is what precedes `<mount>/_svartz/submissions`.
    const deploymentBase = context.base.slice(0, -`${context.vault.mountPath}/_svartz/${PLUGIN_ID}`.length);
    const pageUrl = new URL(`${deploymentBase}${page}`, request.url).href;
    const pull = await openSubmission(target(context), { kind: "edit", path, page, pageUrl, markdown, note });
    return Response.json(pull satisfies EditResponse, { status: 201 });
  }

  const routes = new Map([
    ["/source/", { method: "GET", run: source }],
    ["/edit/", { method: "POST", run: edit }],
  ]);

  return async (request, context) => {
    const route = routes.get(new URL(request.url).pathname.slice(context.base.length));
    if (!route) return undefined;
    if (request.method !== route.method) {
      return Response.json(
        { error: "method_not_allowed", message: `Use ${route.method}.` },
        { status: 405, headers: { allow: route.method } },
      );
    }
    try {
      return await route.run(request, context);
    } catch (error) {
      if (error instanceof SubmissionError) return error.toResponse();
      throw error;
    }
  };
};

export default submissions;

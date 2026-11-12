/**
 * The submissions server module, mounted at `<base><mount>/_svartz/submissions/`:
 *
 * - `GET source/?page=<route>` answers `{ markdown }`, the note's source at the build commit.
 * - `GET links/` answers `{ notes, attachments }`, the published notes a wikilink can name and the published
 *   attachments, for the editor's autocomplete and Split preview.
 * - `POST edit/` with `{ submissionId, page, markdown, note?, turnstileToken? }` opens a pull request and answers 201 `{ url, number }`.
 * - `POST new/` with `{ submissionId, folder, title, markdown, note?, turnstileToken? }` does the same for a new note.
 *
 * The client never names a file path. Edits must target a note in the build's manifest; a new note goes in one of the
 * manifest's folders, named after its title, and never where a file already is. Every submission passes the guard
 * (required sign-in, rate limit, and Turnstile when configured) before any GitHub call, a GitHub App's token exchange
 * included. A signed-in reader is credited in the pull request, and authors its commit when signed in with GitHub.
 * Failures answer `{ error, message }`.
 */
import { readIdentity } from "@svartz/auth/server";
import type { ServerContext, ServerModuleFactory } from "@svartz/core";
import { pathRoute } from "@svartz/plugins/routes";
import {
  MAX_MARKDOWN_BYTES,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  PLUGIN_ID,
  SUBMISSION_ID_PATTERN,
  type EditResponse,
  type LinksResponse,
  type LinkTarget,
  type PreviewSettings,
  type SourceResponse,
} from "./api";
import { appTokens, type AppCredentials } from "./app";
import { misconfigured, SubmissionError } from "./errors";
import { openSubmission, readSource, type GitHubTarget, type Submission } from "./github";
import { createGuard, type GuardOptions } from "./guard";

/** Exactly one kind of GitHub credentials: a token, or a GitHub App. */
export type Credentials =
  | { readonly token: { readonly env: string }; readonly app?: never }
  | { readonly app: AppCredentials; readonly token?: never };

/** The plugin's server options, as written into the server bundle. */
export type ServerOptions = Credentials & {
  readonly repo: string;
  readonly branch?: string;
  readonly labels: readonly string[];
  readonly guard: GuardOptions;
};

/** What the build records for the server: never sent to the browser. */
export interface BuildData {
  /** The commit the site was built from. */
  readonly commit: string;
  /** Each editable note's route below the deployment base, mapped to its repository-relative path. */
  readonly pages: Readonly<Record<string, string>>;
  /**
   * Every route a page holds or asks for, of any type and protected or hidden ones included, as `core:allocate-routes`
   * derives it, mapped to the page's route below the deployment base, or `null` for a hidden page. A new note asking
   * for one of these would take that page's URL or move it.
   */
  readonly routes: Readonly<Record<string, string | null>>;
  /** The vault's folder inside the repository, `""` at its root. */
  readonly vaultRoot: string;
  /** Vault folders that hold a published note, where new notes may go. `""` is the vault's top level. */
  readonly folders: readonly string[];
  /** The published notes the editor suggests after `[[`, and its preview links. */
  readonly links: readonly LinkTarget[];
  readonly preview: PreviewSettings;
}

/** Room for a full note, the longest note and the JSON around them. */
const MAX_REQUEST_BYTES = MAX_MARKDOWN_BYTES + MAX_NOTE_LENGTH * 4 + 4096;
/** Characters Obsidian refuses in a note's name, and control characters. */
const FORBIDDEN_TITLE_CHARACTERS = /[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();
const tooLarge = () => new SubmissionError("too_large", 413, "This page is too large to submit from the site.");
const invalid = () => new SubmissionError("invalid_request", 400, "Your changes didn't arrive intact. Reload the page and try again.");
const invalidTitle = (message: string) => new SubmissionError("invalid_title", 400, message);

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

/** The fields every submission carries, checked, and the rest of its JSON body for the route to check. */
async function readSubmission(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readText(request)) ?? {};
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    throw invalid();
  }
  const { submissionId, markdown, note = "", turnstileToken } = body;
  if (
    typeof submissionId !== "string" || !SUBMISSION_ID_PATTERN.test(submissionId)
    || typeof markdown !== "string" || typeof note !== "string"
    || (turnstileToken !== undefined && typeof turnstileToken !== "string")
  ) {
    throw invalid();
  }
  if (encoder.encode(markdown).byteLength > MAX_MARKDOWN_BYTES) throw tooLarge();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new SubmissionError("note_too_long", 400, `Shorten the note to ${MAX_NOTE_LENGTH.toLocaleString("en")} characters or fewer.`);
  }
  return { body, submission: { id: submissionId, markdown, note }, turnstileToken };
}

const submissions: ServerModuleFactory<ServerOptions, BuildData> = (options, data) => {
  const pages = new Map(Object.entries(data.pages));
  const routes = new Map(Object.entries(data.routes));
  const folders = new Set(data.folders);
  const guard = createGuard(options.guard);

  function notePath(page: string | null): string {
    const path = page === null ? undefined : pages.get(page);
    if (!path) throw new SubmissionError("not_editable", 404, "This page can't be edited from the site.");
    return path;
  }

  /** A new note's path in the vault, named after its title as in Obsidian. Refuses folders the build didn't publish. */
  function newNotePath(folder: string, rawTitle: string): string {
    if (!folders.has(folder)) throw new SubmissionError("not_a_section", 400, "Choose a section from the list.");
    const title = rawTitle.trim();
    if (!title) throw invalidTitle("Give the page a title.");
    if (title.length > MAX_TITLE_LENGTH) throw invalidTitle(`Shorten the title to ${MAX_TITLE_LENGTH} characters or fewer.`);
    if (title.startsWith(".") || FORBIDDEN_TITLE_CHARACTERS.test(title)) {
      throw invalidTitle('Titles can\'t start with a dot or contain \\ / : * ? " < > | # ^ [ ].');
    }
    return folder ? `${folder}/${title}.md` : `${title}.md`;
  }

  /** The token every GitHub call authenticates with: the configured one, or the App's installation token. */
  const githubToken = options.app ? appTokens(options.repo, options.app) : async (env: ServerContext["env"]) => {
    const token = env[options.token.env];
    if (typeof token !== "string" || !token) throw misconfigured(`its server has no ${options.token.env} set`);
    return token;
  };

  async function target(context: ServerContext): Promise<GitHubTarget> {
    const token = await githubToken(context.env);
    return { repo: options.repo, token, branch: options.branch, labels: options.labels, commit: data.commit };
  }

  /** The public URL of `route`, a path below the deployment base: what precedes `<mount>/_svartz/submissions`. */
  function publicUrl(route: string, request: Request, context: ServerContext): string {
    const deploymentBase = context.base.slice(0, -`${context.vault.mountPath}/_svartz/${PLUGIN_ID}`.length);
    return new URL(`${deploymentBase}${route}`, request.url).href;
  }

  /** Pass the guard, then open the pull request, crediting the signed-in reader. */
  async function open(
    request: Request,
    context: ServerContext,
    turnstileToken: string | undefined,
    submission: Omit<Submission, "submitter">,
  ) {
    const submitter = await readIdentity(request, context.env);
    await guard({ token: turnstileToken, identity: submitter, clientAddress: context.clientAddress, env: context.env });
    const pull = await openSubmission(await target(context), { ...submission, submitter });
    return Response.json(pull satisfies EditResponse, { status: 201 });
  }

  async function source(request: Request, context: ServerContext): Promise<Response> {
    const path = notePath(new URL(request.url).searchParams.get("page"));
    const markdown = await readSource(await target(context), path);
    return Response.json({ markdown } satisfies SourceResponse);
  }

  async function edit(request: Request, context: ServerContext): Promise<Response> {
    const { body: { page }, submission, turnstileToken } = await readSubmission(request);
    if (typeof page !== "string") throw invalid();
    const path = notePath(page);
    const pageUrl = publicUrl(page, request, context);
    return open(request, context, turnstileToken, { ...submission, kind: "edit", path, page, pageUrl });
  }

  async function create(request: Request, context: ServerContext): Promise<Response> {
    const { body: { folder, title }, submission, turnstileToken } = await readSubmission(request);
    if (typeof folder !== "string" || typeof title !== "string") throw invalid();
    const vaultPath = newNotePath(folder, title);
    const path = data.vaultRoot ? `${data.vaultRoot}/${vaultPath}` : vaultPath;
    const existing = routes.get(pathRoute(vaultPath));
    if (existing !== undefined) {
      // A hidden page gets no link: the site never shows where it is.
      throw new SubmissionError(
        "exists",
        409,
        existing !== null && pages.has(existing)
          ? "A page with this title already exists. Choose another title, or edit that page."
          : "A page with this title already exists. Choose another title.",
        undefined,
        existing === null ? undefined : publicUrl(existing, request, context),
      );
    }
    // The pull request names where the reader came from: this vault's home page.
    const pageUrl = publicUrl(`${context.vault.mountPath}/`, request, context);
    return open(request, context, turnstileToken, { ...submission, kind: "new", path, page: path.slice(0, -".md".length), pageUrl });
  }

  const links = async () => Response.json({ notes: data.links, ...data.preview } satisfies LinksResponse);

  const handlers = new Map([
    ["/source/", { method: "GET", run: source }],
    ["/links/", { method: "GET", run: links }],
    ["/edit/", { method: "POST", run: edit }],
    ["/new/", { method: "POST", run: create }],
  ]);

  return async (request, context) => {
    const route = handlers.get(new URL(request.url).pathname.slice(context.base.length));
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

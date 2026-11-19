/**
 * The submissions server module, mounted at `<base><mount>/_svartz/submissions/`:
 *
 * - `GET source/?page=<route>` answers `{ markdown, sha, destination }`: the note's source at the build commit, its
 *   blob SHA, and where the reader's edit of it would go.
 * - `GET destination/?folder=<folder>&title=<title>` answers `{ destination }` for a new page.
 * - `GET links/` answers `{ notes, attachments }`, the published notes a wikilink can name and the published
 *   attachments, for the editor's autocomplete and Split preview.
 * - `POST edit/` with `{ submissionId, page, markdown, note?, sha?, turnstileToken? }` saves an edit and answers 201
 *   with the commit or the pull request.
 * - `POST new/` with `{ submissionId, folder, title, markdown, note?, turnstileToken? }` does the same for a new note.
 *
 * The client never names a file path. Edits must target a note in the build's manifest; a new note goes in one of the
 * manifest's folders, named after its title, and never where a file already is.
 *
 * Where a save goes is decided here for every request, on the page it writes. Without accounts (no `SVARTZ_DB`), it
 * opens a pull request, as before accounts. With them, it commits when the mode allows commits, a GitHub App is
 * configured and the account holds `submissions:commits:write` on the page; otherwise it opens a pull request when
 * the mode allows those and the reader holds `submissions:pull-requests:write`; otherwise it is refused. A commit
 * whose file changed on the branch since the reader loaded it opens a pull request instead.
 *
 * Every save passes the guard (required sign-in, rate limit, and Turnstile when configured) before any GitHub call, a
 * GitHub App's token exchange included. Failures answer `{ error, message }`.
 */
import { can, linkedIdentities, readIdentity, readSignIn, type Account, type Identity } from "@svartz/auth/server";
import type { ServerContext, ServerModuleFactory } from "@svartz/core";
import { pathRoute } from "@svartz/plugins/routes";
import {
  MAX_MARKDOWN_BYTES,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  PLUGIN_ID,
  SUBMISSION_ID_PATTERN,
  type Destination,
  type DestinationResponse,
  type EditResponse,
  type LinksResponse,
  type LinkTarget,
  type PreviewSettings,
  type SourceResponse,
} from "./api";
import { appTokens, type AppCredentials } from "./app";
import { misconfigured, SubmissionError } from "./errors";
import { commitSubmission, openSubmission, readSource, type Attribution, type GitHubTarget, type Submission } from "./github";
import { createGuard, type GuardOptions } from "./guard";
import { COMMIT, OPEN_PULL_REQUESTS } from "./permissions";

/**
 * Which saves may commit. `permission` commits for whoever holds `submissions:commits:write` on the page and opens a
 * pull request for the rest; `commit` refuses the rest instead; `pull-request` never commits.
 */
export type Mode = "commit" | "pull-request" | "permission";

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
  readonly mode: Mode;
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
/** A git blob SHA, as {@link SourceResponse.sha} gives it. */
const BLOB_SHA = /^[0-9a-f]{40}$/;

/** Who sent a request. Without accounts, `account` is always `null` and `identity` is the session's provider account. */
interface Reader {
  readonly accounts: boolean;
  readonly account: Account | null;
  readonly identity: Identity | null;
}

async function readReader(request: Request, env: ServerContext["env"]): Promise<Reader> {
  const signIn = await readSignIn(request, env);
  if (signIn.reason === "no-database") return { accounts: false, account: null, identity: await readIdentity(request, env) };
  return { accounts: true, account: signIn.account, identity: signIn.account?.identity ?? null };
}

/** JSON that depends on who asks, so no cache keeps it for anyone else. */
const privateJson = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store" } });

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
  // Every editable page is published, so the links list holds its slug, which permissions are checked on.
  const slugs = new Map(data.links.map(({ href, slug }) => [href, slug]));
  const routes = new Map(Object.entries(data.routes));
  const folders = new Set(data.folders);
  const guard = createGuard(options.guard);

  /** The repository path and slug of the editable note at route `page`. */
  function editable(page: string | null): { path: string; slug: string } {
    const path = page === null ? undefined : pages.get(page);
    const slug = page === null ? undefined : slugs.get(page);
    if (!path || slug === undefined) throw new SubmissionError("not_editable", 404, "This page can't be edited from the site.");
    return { path, slug };
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

  /**
   * Where `reader`'s save of the page with slug `page` goes; `null` when they may not save it. Saves commit only on a
   * site with accounts, as an account, and only with a GitHub App, which the commit names as its committer.
   */
  async function destinationFor(reader: Reader, page: string, context: ServerContext): Promise<Destination> {
    if (!reader.accounts) {
      if (options.mode === "commit") {
        throw new SubmissionError("misconfigured", 503, "This site can't save edits yet: commits need accounts, and its server has no SVARTZ_DB bound.");
      }
      return "pull-request";
    }
    const { account } = reader;
    const target = { vault: context.vault.id, page };
    if (options.mode !== "pull-request" && options.app && account && await can(account, COMMIT, target, context.env)) return "commit";
    if (options.mode !== "commit" && await can(account, OPEN_PULL_REQUESTS, target, context.env)) return "pull-request";
    return null;
  }

  /** The account a commit is authored as, with its linked GitHub account as co-author. */
  async function attribution(account: Account, request: Request, context: ServerContext): Promise<Attribution> {
    const github = (await linkedIdentities(account, context.env)).find(({ provider }) => provider === "github");
    return { accountId: account.id, name: account.name, handle: account.handle, host: new URL(request.url).hostname, ...(github ? { github } : {}) };
  }

  /**
   * Decide where the save goes, on `slug`, the page it writes; pass the guard; then commit or open the pull request.
   * `loaded` is the blob SHA the editor loaded, for an edit. A commit that finds the file changed opens a pull request.
   */
  async function save(
    request: Request,
    context: ServerContext,
    turnstileToken: string | undefined,
    slug: string,
    submission: Omit<Submission, "submitter">,
    loaded?: string,
  ): Promise<Response> {
    const reader = await readReader(request, context.env);
    const destination = await destinationFor(reader, slug, context);
    if (!destination) {
      if (!reader.identity) throw new SubmissionError("sign_in_required", 401, "Sign in to send edits from this site.");
      throw new SubmissionError("not_allowed", 403, "Your account can't edit this page.");
    }
    // Without the SHA of what the reader loaded, a commit couldn't tell whether it overwrites someone's change.
    if (destination === "commit" && submission.kind === "edit" && loaded === undefined) throw invalid();
    await guard({ token: turnstileToken, identity: reader.identity, clientAddress: context.clientAddress, env: context.env });
    const github = await target(context);
    const full: Submission = { ...submission, submitter: reader.identity };
    let answer: EditResponse;
    if (destination === "commit") {
      const committed = await commitSubmission(github, full, loaded, await attribution(reader.account!, request, context));
      answer = committed.kind === "commit" ? committed : { kind: "pull-request", ...await openSubmission(github, full), reason: "changed" };
    } else {
      answer = { kind: "pull-request", ...await openSubmission(github, full) };
    }
    return Response.json(answer, { status: 201 });
  }

  async function source(request: Request, context: ServerContext): Promise<Response> {
    const { path, slug } = editable(new URL(request.url).searchParams.get("page"));
    const [{ markdown, sha }, destination] = await Promise.all([
      target(context).then((github) => readSource(github, path)),
      readReader(request, context.env).then((reader) => destinationFor(reader, slug, context)),
    ]);
    return privateJson({ markdown, sha, destination } satisfies SourceResponse);
  }

  async function destination(request: Request, context: ServerContext): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const vaultPath = newNotePath(query.get("folder") ?? "", query.get("title") ?? "");
    const reader = await readReader(request, context.env);
    return privateJson({ destination: await destinationFor(reader, pathRoute(vaultPath), context) } satisfies DestinationResponse);
  }

  async function edit(request: Request, context: ServerContext): Promise<Response> {
    const { body: { page, sha }, submission, turnstileToken } = await readSubmission(request);
    if (typeof page !== "string" || (sha !== undefined && (typeof sha !== "string" || !BLOB_SHA.test(sha)))) throw invalid();
    const { path, slug } = editable(page);
    const pageUrl = publicUrl(page, request, context);
    return save(request, context, turnstileToken, slug, { ...submission, kind: "edit", path, page, pageUrl }, sha);
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
    return save(request, context, turnstileToken, pathRoute(vaultPath), { ...submission, kind: "new", path, page: path.slice(0, -".md".length), pageUrl });
  }

  const links = async () => Response.json({ notes: data.links, ...data.preview } satisfies LinksResponse);

  const handlers = new Map([
    ["/source/", { method: "GET", run: source }],
    ["/destination/", { method: "GET", run: destination }],
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

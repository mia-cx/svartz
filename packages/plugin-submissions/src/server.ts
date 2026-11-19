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
 * - With `sync` set, `POST github/webhook/` takes GitHub's deliveries into the mirror, and `GET status/?edit=<id>`
 *   answers where a saved edit has got to (see `sync.ts`). Every save is then recorded for its saver to follow, and
 *   the dashboard gets the Recent edits panel (`recent-edits.ts`).
 *
 * The client never names a file path. Edits must target a note in the build's manifest; a new note goes in one of the
 * manifest's folders, or is the reader's own user page, named after its title, and never where a file already is.
 *
 * Where a save goes is decided here for every request, on the page it writes. Without accounts (no `SVARTZ_DB`), it
 * opens a pull request, as before accounts. With them, it commits when the mode allows commits, a GitHub App is
 * configured and the account holds `submissions:commits:write` on the page; otherwise it opens a pull request when
 * the mode allows those and the reader holds `submissions:pull-requests:write`; otherwise it is refused. A commit
 * opens a pull request instead when its frontmatter claims a route the account may not commit to, when its file
 * changed on the branch since the reader loaded it, or when a rule for the branch refuses it.
 *
 * Every save passes the guard (required sign-in, rate limit, and Turnstile when configured) before any GitHub call, a
 * GitHub App's token exchange included. Failures answer `{ error, message }`.
 */
import { can, linkedIdentities, readIdentity, readSignIn, userPageLocation, type Account, type Identity } from "@svartz/auth/server";
import type { ServerContext, ServerHandler, ServerModuleFactory } from "@svartz/core";
import { alternateRoutes, extractFrontmatter, pathRoute, requestedSlug } from "@svartz/plugins/routes";
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
  type ReviewReason,
  type SourceResponse,
} from "./api";
import { appCommitter, appTokens, type AppCredentials } from "./app";
import { misconfigured, SubmissionError } from "./errors";
import {
  commitSubmission,
  openSubmission,
  readSource,
  type Attribution,
  type GitHubTarget,
  type Person,
  type Submission,
} from "./github";
import { createGuard, type GuardOptions } from "./guard";
import { COMMIT, OPEN_PULL_REQUESTS } from "./permissions";
import { recentEditsPanel } from "./recent-edits";
import { readBody } from "./request";
import { createSync, type SyncOptions } from "./sync";

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
  /** Mirror GitHub and follow saved edits to live. */
  readonly sync?: SyncOptions;
};

/** The page holding a route: its slug, which permissions are checked on, and its URL below the deployment base, `null` when hidden. */
export interface RouteHolder {
  readonly slug: string;
  readonly href: string | null;
}

/** What the build records for the server: never sent to the browser. */
export interface BuildData {
  /** The commit the site was built from. */
  readonly commit: string;
  /** Each editable note's route below the deployment base, mapped to its repository-relative path. */
  readonly pages: Readonly<Record<string, string>>;
  /**
   * Every route a page holds or asks for, of any type and protected or hidden ones included, as `core:allocate-routes`
   * derives it, mapped to that page. A note asking for one of these would take that page's URL or move it.
   */
  readonly routes: Readonly<Record<string, RouteHolder>>;
  /** Every route a page's aliases redirect from or ask to, mapped to the page that holds the redirect. */
  readonly aliases: Readonly<Record<string, RouteHolder>>;
  /** The frontmatter field the build reads aliases from, besides `alias` and `permalink`. */
  readonly aliasesField: string;
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

/** Who owns what `reader` saves: their account, or without accounts their sign-in; `null` for a guest. */
const ownerOf = ({ account, identity }: Reader) =>
  account ? `account:${account.id}` : identity ? `identity:${identity.id}` : null;

/** JSON that depends on who asks, so no cache keeps it for anyone else. */
const privateJson = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store" } });

/** The fields every submission carries, checked, and the rest of its JSON body for the route to check. */
async function readSubmission(request: Request) {
  let body: Record<string, unknown>;
  try {
    const bytes = await readBody(request, MAX_REQUEST_BYTES);
    if (!bytes) throw tooLarge();
    body = JSON.parse(new TextDecoder().decode(bytes)) ?? {};
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
  const notes = new Map(data.links.map((link) => [link.href, link]));
  const routes = new Map(Object.entries(data.routes));
  const aliases = new Map(Object.entries(data.aliases));
  const folders = new Set(data.folders);
  const guard = createGuard(options.guard);

  /** The repository path, vault path and slug of the editable note at route `page`. */
  function editable(page: string | null): { path: string; vaultPath: string; slug: string } {
    const path = page === null ? undefined : pages.get(page);
    const link = page === null ? undefined : notes.get(page);
    if (!path || !link) throw new SubmissionError("not_editable", 404, "This page can't be edited from the site.");
    return { path, vaultPath: link.path, slug: link.slug };
  }

  /**
   * Whether `account` may commit `markdown` at `vaultPath` without taking a route it may not commit to. Every route
   * the note would claim, read as the build reads it (its slug, from frontmatter or its file name, and each route its
   * aliases ask to redirect from), needs `submissions:commits:write`, and so does any other page holding one of them,
   * which the note would move or take a redirect from. A route `self`, the page being edited, already holds is no new
   * claim. Frontmatter the build would refuse claims nothing that can be checked, so it may not commit either.
   */
  async function mayClaim(account: Account, vaultPath: string, markdown: string, self: string | undefined, context: ServerContext): Promise<boolean> {
    let claimed: string[];
    try {
      const { frontmatter } = extractFrontmatter(markdown);
      claimed = [requestedSlug({ path: vaultPath, frontmatter }), ...alternateRoutes(frontmatter, data.aliasesField)];
    } catch {
      return false;
    }
    const objects = new Set<string>();
    for (const route of claimed) {
      const holders = [routes.get(route), aliases.get(route)].filter((holder) => holder !== undefined);
      if (!holders.some(({ slug }) => slug === self)) objects.add(route);
      for (const { slug } of holders) if (slug !== self) objects.add(slug);
    }
    for (const page of objects) {
      if (!await can(account, COMMIT, { vault: context.vault.id, page }, context.env)) return false;
    }
    return true;
  }

  /**
   * A new note's path in the vault, named after its title as in Obsidian. Refuses folders the build didn't publish,
   * except for `account`'s own user page, `<user page folder>/<handle>` in the vault that holds user pages, which it may
   * start in a folder with no page yet.
   */
  function newNotePath(folder: string, rawTitle: string, account: Account | null, vault: string): string {
    const title = rawTitle.trim();
    const userPages = userPageLocation();
    const ownUserPage = account !== null && vault === userPages.vault && folder === userPages.folder && title === account.handle;
    if (!folders.has(folder) && !ownUserPage) throw new SubmissionError("not_a_section", 400, "Choose a section from the list.");
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
  /** The App's bot user, which a commit names as its committer. Only an App commits. */
  const committer = options.app ? appCommitter(options.repo, options.app, githubToken) : undefined;
  const sync = options.sync && createSync(options.sync, {
    repo: options.repo,
    ...(options.branch ? { branch: options.branch } : {}),
    root: data.vaultRoot,
    token: githubToken,
  });

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
    if (options.mode !== "pull-request" && committer && account && await can(account, COMMIT, target, context.env)) return "commit";
    if (options.mode !== "commit" && await can(account, OPEN_PULL_REQUESTS, target, context.env)) return "pull-request";
    return null;
  }

  /** The account a commit is authored as, with its linked GitHub account as co-author, and the App that commits it. */
  async function attribution(account: Account, committedBy: Person, request: Request, context: ServerContext): Promise<Attribution> {
    const github = (await linkedIdentities(account, context.env)).find(({ provider }) => provider === "github");
    return {
      accountId: account.id,
      name: account.name,
      handle: account.handle,
      host: new URL(request.url).hostname,
      committer: committedBy,
      ...(github ? { github } : {}),
    };
  }

  /**
   * Decide where the save goes, on `slug`, the page it writes at `vaultPath`; pass the guard; then commit or open the
   * pull request. `loaded` is the blob SHA the editor loaded, for an edit. A commit that would claim a route the
   * account may not commit to, finds the file changed, or that GitHub refuses opens a pull request instead.
   */
  async function save(
    request: Request,
    context: ServerContext,
    turnstileToken: string | undefined,
    { slug, vaultPath }: { slug: string; vaultPath: string },
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

    /** Answer the save, recorded first for its saver to follow when the site tracks edits. */
    async function saved(answer: EditResponse): Promise<Response> {
      await sync?.record(context, {
        id: submission.id,
        owner: ownerOf(reader),
        kind: answer.kind,
        page: submission.page,
        path: submission.path,
        commit: answer.kind === "commit" ? answer.sha : null,
        pull: answer.kind === "pull-request" ? answer.number : null,
        url: answer.url,
        savedAt: new Date().toISOString(),
      }).catch((error: unknown) => {
        // The edit is saved; only following it is lost, so the answer stands.
        console.error("[submissions] saved an edit but couldn't record it to follow", error);
      });
      return Response.json(answer, { status: 201 });
    }

    let review: ReviewReason | undefined;
    if (destination === "commit" && reader.account && committer) {
      const self = submission.kind === "edit" ? slug : undefined;
      if (await mayClaim(reader.account, vaultPath, submission.markdown, self, context)) {
        const by = await attribution(reader.account, await committer(context.env), request, context);
        const committed = await commitSubmission(github, full, loaded, by);
        if (committed.kind === "commit") return saved(committed);
        review = committed.reason;
      } else {
        review = "route";
      }
    }
    return saved({ kind: "pull-request", ...await openSubmission(github, full), ...(review ? { reason: review } : {}) });
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
    const reader = await readReader(request, context.env);
    const vaultPath = newNotePath(query.get("folder") ?? "", query.get("title") ?? "", reader.account, context.vault.id);
    return privateJson({ destination: await destinationFor(reader, pathRoute(vaultPath), context) } satisfies DestinationResponse);
  }

  async function edit(request: Request, context: ServerContext): Promise<Response> {
    const { body: { page, sha }, submission, turnstileToken } = await readSubmission(request);
    if (typeof page !== "string" || (sha !== undefined && (typeof sha !== "string" || !BLOB_SHA.test(sha)))) throw invalid();
    const { path, vaultPath, slug } = editable(page);
    const pageUrl = publicUrl(page, request, context);
    return save(request, context, turnstileToken, { slug, vaultPath }, { ...submission, kind: "edit", path, page, pageUrl }, sha);
  }

  async function create(request: Request, context: ServerContext): Promise<Response> {
    const { body: { folder, title }, submission, turnstileToken } = await readSubmission(request);
    if (typeof folder !== "string" || typeof title !== "string") throw invalid();
    const vaultPath = newNotePath(folder, title, (await readReader(request, context.env)).account, context.vault.id);
    const path = data.vaultRoot ? `${data.vaultRoot}/${vaultPath}` : vaultPath;
    const existing = routes.get(pathRoute(vaultPath));
    if (existing) {
      // A hidden page gets no link: the site never shows where it is.
      const { href } = existing;
      throw new SubmissionError(
        "exists",
        409,
        href !== null && pages.has(href)
          ? "A page with this title already exists. Choose another title, or edit that page."
          : "A page with this title already exists. Choose another title.",
        undefined,
        href === null ? undefined : publicUrl(href, request, context),
      );
    }
    // The pull request names where the reader came from: this vault's home page.
    const pageUrl = publicUrl(`${context.vault.mountPath}/`, request, context);
    const slug = pathRoute(vaultPath);
    return save(request, context, turnstileToken, { slug, vaultPath }, { ...submission, kind: "new", path, page: path.slice(0, -".md".length), pageUrl });
  }

  const links = async () => Response.json({ notes: data.links, ...data.preview } satisfies LinksResponse);

  const handlers = new Map<string, { method: string; run: (request: Request, context: ServerContext) => Promise<Response> }>([
    ["/source/", { method: "GET", run: source }],
    ["/destination/", { method: "GET", run: destination }],
    ["/links/", { method: "GET", run: links }],
    ["/edit/", { method: "POST", run: edit }],
    ["/new/", { method: "POST", run: create }],
    ...sync
      ? [
        ["/github/webhook/", { method: "POST", run: sync.webhook }],
        ["/status/", { method: "GET", run: async (request: Request, context: ServerContext) => sync.status(request, context, ownerOf(await readReader(request, context.env))) }],
      ] as const
      : [],
  ]);

  const handle: ServerHandler = async (request, context) => {
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

  if (!sync) return handle;
  const recentEdits = recentEditsPanel({ repo: options.repo, vaultRoot: data.vaultRoot, links: data.links, attachments: data.preview.attachments, sync });
  return { handle, dashboard: { title: "Submissions", panels: [recentEdits] } };
};

export default submissions;

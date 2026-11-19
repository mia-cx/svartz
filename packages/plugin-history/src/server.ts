/**
 * The history server module. It renders four kinds of plugin page in the theme's shell, to anyone who can read the
 * site:
 *
 * - `/-/history/<page>`: the changes to a published page, newest first in the branch's ancestry. `?page=<n>` goes back
 *   through older ones.
 * - `/-/history/<page>?to=<sha>&from=<sha>`: what changed in the page's source between two revisions, and the page
 *   at the newer one, rendered with the build's Markdown steps. Without `from`, the change to the page before `to`.
 * - `/-/changes/`: every change to a published page, newest first. `?before=<sha>` goes back further.
 * - `/-/contributions/<handle>/`: the changes the site's records say an account made, newest first, every published
 *   page they changed, and its reputation. `?before=<sha>` goes back further; an old handle redirects to the current one.
 *
 * Its routes, under `<mount>/_svartz/history/`:
 *
 * - `GET contributions/?page=<path>` answers the section a user page shows below its note, as HTML: for the page at
 *   `path` below the deployment base, its account's reputation, latest changes and the pages they changed. It answers
 *   404 for any other page, and on a site without accounts.
 * - `POST revert/`, the diff page's form, reverts a page to an earlier revision for an account holding
 *   `history:reverts:write` on it: one commit through the submissions plugin's commit path, as that account, with an
 *   audit entry, taking back the reputation the changes since earned (`revertRoute`). The history list links each
 *   older change to that form, and the diff page offers it for its earlier revision, to viewers who hold the permission.
 *
 * Commits come from the submissions plugin's GitHub mirror, and from GitHub through it for what the mirror lacks
 * (`@svartz/plugin-submissions/commits`). Only what the site publishes shows: pages that are hidden, private or
 * password-protected have no history, and a change to one never shows on Recent changes or among an account's
 * contributions, nor does the summary of any commit that changed one. A revision whose frontmatter hid or protected
 * it shows no content. Only the account itself sees its next reputation threshold.
 */
import type { PageContext, PageResult, ServerContext, ServerModuleFactory } from "@svartz/core";
import {
  audit, can, canEach, findProfiles, findStanding, readAccount, readSignIn, userPageLocation, userPageOf,
  type AccountStanding,
} from "@svartz/auth/server";
import { commitReader, CommitsUnavailable, sourceToken, type Commit, type CommitReader } from "@svartz/plugin-submissions/commits";
import { renderRevision, wasPublic } from "@svartz/plugin-submissions/render";
import { restorer } from "@svartz/plugin-submissions/restore";
import type { PreviewNote } from "@svartz/plugins/preview";
import { PLUGIN_ID, type HistoryData } from "./api";
import { diffLines } from "./diff";
import {
  changesPage, contributionsPage, contributionsSection, diffPage, historyPage, type Author, type Change, type Comparison,
  type Contributions, type RevertForm, type WikiChange,
} from "./pages";
import { REVERT } from "./permissions";

/** Pages of a file's history readers may page back through; older ones are on GitHub. */
export const MAX_HISTORY_PAGE = 10;
/** The longest reason a revert takes, which its commit message carries. */
export const MAX_REASON_LENGTH = 500;
/** Room for a revert's form: three SHAs, a page's route and the longest reason, URL-encoded. */
const MAX_FORM_BYTES = 16 * 1024;
/** Changes, and pages they changed, that a user page's section lists; the rest are on the contributions page. */
const SECTION_CHANGES = 5;
const SECTION_PAGES = 10;
const SHA = /^[0-9a-f]{40}$/;
const PAGE_NUMBER = /^(?:0|[1-9]\d?)$/;
const CONTRIBUTIONS = /^contributions\/([^/]+)\/$/;
const revisionDay = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** A refused form post, as plain text: the reader's browser shows it as the page. */
const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const redirect = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

/** A form post's fields, or `undefined` once its body passes {@link MAX_FORM_BYTES}: the stream is cancelled there. */
async function formOf(request: Request): Promise<URLSearchParams | undefined> {
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    bytes += read.value.byteLength;
    if (bytes > MAX_FORM_BYTES) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(read.value, { stream: true });
  }
  return new URLSearchParams(text + decoder.decode());
}

const history: ServerModuleFactory<unknown, HistoryData> = (_options, data) => {
  // One installation token for reading and committing.
  const token = sourceToken(data.source);
  const read = commitReader(data.source, token);
  const restore = restorer(data.source, data.claims, token);
  const notes = new Map(data.notes.filter(({ path }) => /\.md$/i.test(path)).map((note) => [note.href, note]));
  const byPath = new Map(data.notes.filter(({ path }) => /\.md$/i.test(path)).map((note) => [note.path, note]));
  /** Every published, unprotected note by its route, whatever its format. */
  const everyNote = new Map(data.notes.map((note) => [note.href, note]));
  const published = new Set([...data.notes.map(({ path }) => path), ...data.preview.attachments]);
  const { repo, root, branch } = data.source;
  const repoPath = (path: string) => (root ? `${root}/${path}` : path);

  /** A commit's summary, unless it changed a file the site doesn't publish, or files nobody listed in full. */
  const shownSummary = (commit: Commit) =>
    commit.allFiles && commit.files !== null && commit.files.every((file) => published.has(file)) ? commit.summary : undefined;

  /** Every URL a page links to, from the plugin's own `context.base`: `<deployment base><mount>/_svartz/history`. */
  function urls(context: ServerContext) {
    const mount = context.vault.mountPath;
    const deployment = context.base.slice(0, -`${mount}/_svartz/${PLUGIN_ID}`.length);
    const query = (values?: Record<string, string>) => (values ? `?${new URLSearchParams(values)}` : "");
    return {
      deployment,
      page: (note: PreviewNote) => encodeURI(`${deployment}${note.href}`),
      history: (note: PreviewNote, values?: Record<string, string>) =>
        `${encodeURI(`${deployment}${mount}/-/history${note.href.slice(mount.length)}`)}${query(values)}`,
      changes: (values?: Record<string, string>) => `${encodeURI(`${deployment}${mount}/-/changes/`)}${query(values)}`,
      contributions: (handle: string, values?: Record<string, string>) =>
        `${encodeURI(`${deployment}${mount}/-/contributions/`)}${encodeURIComponent(handle)}/${query(values)}`,
      /** The URL below the deployment base of a user page, from auth. */
      userPage: (href: string) => encodeURI(`${deployment}${href}`),
    };
  }

  /**
   * `commits` as the pages show them. Each is by the account the site's records name, under its current handle and
   * name, linked to its user page or else its contributions, or by its git author.
   */
  async function changesOf(commits: readonly Commit[], context: ServerContext): Promise<Change[]> {
    const link = urls(context);
    const profiles = await findProfiles([...new Set(commits.flatMap((commit) => commit.account ? [commit.account.id] : []))], context.env);
    return commits.map((commit) => {
      const profile = commit.account && profiles.get(commit.account.id);
      const userPage = profile && userPageOf(profile.handle);
      // An account that no longer exists shows as git names the commit.
      const author: Author = profile
        ? {
          kind: "account", name: profile.name, handle: profile.handle, reputation: profile.reputation,
          href: userPage ? link.userPage(userPage) : link.contributions(profile.handle),
        }
        : { kind: "github", name: commit.author.name, login: commit.author.login };
      return { sha: commit.sha, at: commit.committedAt, author, summary: shownSummary(commit) };
    });
  }

  /** `commits` with the published pages each changed; a commit that changed none of them stays out. */
  async function wikiChanges(commits: readonly Commit[], context: ServerContext): Promise<WikiChange[]> {
    const link = urls(context);
    const shown = await changesOf(commits, context);
    return commits.flatMap((commit, index): WikiChange[] => {
      const pages = (commit.files ?? []).flatMap((path) => {
        const note = byPath.get(path);
        return note ? [{ title: note.title, page: link.page(note), diff: link.history(note, { to: commit.sha }), history: link.history(note) }] : [];
      });
      return pages.length ? [{ ...shown[index]!, pages }] : [];
    });
  }

  /** The published pages among `files`, in their order. */
  const publishedPages = (files: readonly string[], context: ServerContext): Contributions["pages"] => {
    const link = urls(context);
    return files.flatMap((path) => {
      const note = byPath.get(path);
      return note ? [{ title: note.title, page: link.page(note) }] : [];
    });
  };

  /** What the account shows of its reputation to `request`'s reader: its next threshold only to itself. */
  async function reputationFor(account: AccountStanding, request: Request, context: ServerContext): Promise<Contributions["reputation"]> {
    const { score, next } = account.standing;
    const viewer = next && await readAccount(request, context.env);
    return viewer?.id === account.id ? { score, next } : { score };
  }

  /** The handle whose user page `note` is: `<folder>/<handle>` in the vault that holds user pages. */
  function userPageHandle(note: PreviewNote, context: ServerContext): string | undefined {
    const { vault, folder } = userPageLocation();
    if (vault !== context.vault.id || !note.slug.startsWith(`${folder}/`)) return undefined;
    const handle = note.slug.slice(folder.length + 1);
    return handle && !handle.includes("/") ? handle : undefined;
  }

  /** Whether `request`'s reader may revert `note`: with a GitHub App to commit, and `history:reverts:write` on the page. */
  async function mayRevert(request: Request, note: PreviewNote, context: ServerContext): Promise<boolean> {
    if (!restore.commits) return false;
    const account = await readAccount(request, context.env);
    return account !== null && await can(account, REVERT, { vault: context.vault.id, page: note.slug }, context.env);
  }

  async function listPage(request: Request, note: PreviewNote, page: number, reader: CommitReader, context: PageContext): Promise<PageResult> {
    const link = urls(context);
    let commits: readonly Commit[] = [];
    let more = false;
    let unavailable = false;
    try {
      ({ commits, more } = await reader.history(note.path, page));
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      unavailable = true;
    }
    reader.refresh();
    const changes = await changesOf(commits, context);
    const github = `https://github.com/${repo}/commits/${encodeURIComponent(branch ?? "HEAD")}/${encodeURI(repoPath(note.path))}`;
    // Reverting reaches as far back as the newest page of changes, which names the page's head too.
    const head = page === 0 ? changes[0]?.sha : undefined;
    const reverts = head !== undefined && await mayRevert(request, note, context);
    return historyPage({
      title: note.title,
      changes,
      unavailable,
      status: new URL(request.url).searchParams.get("status"),
      previousOf: (index) => changes[index + 1]?.sha,
      ...reverts && { revertTo: (index: number) => (index === 0 ? undefined : `${link.history(note, { from: changes[index]!.sha, to: head })}#sv-history-revert`) },
      links: {
        page: link.page(note),
        history: link.history(note),
        changes: link.changes(),
        ...(page > 0 ? { newer: link.history(note, page > 1 ? { page: String(page - 1) } : undefined) } : {}),
        ...(more && page < MAX_HISTORY_PAGE ? { older: link.history(note, { page: String(page + 1) }) } : {}),
        ...(more && page >= MAX_HISTORY_PAGE ? { beyond: github } : {}),
      },
    });
  }

  /** Whether `text`, a revision's content, may show: a file the build would have published unprotected. */
  const visible = (file: Awaited<ReturnType<CommitReader["file"]>>) => file.kind !== "file" || wasPublic(file.markdown);

  /**
   * What changed in `note`'s source from `from` to `to`, and `to` rendered, unless either may not show; and whether
   * `from` is content a revert may restore: a file the build would have published unprotected.
   */
  async function compare(note: PreviewNote, from: Commit | undefined, to: Commit, reader: CommitReader, deployment: string): Promise<{ comparison: Comparison; restorable: boolean }> {
    const after = await reader.file(note.path, to.sha);
    const before = from ? await reader.file(note.path, from.sha) : { kind: "missing" as const };
    const restorable = before.kind === "file" && wasPublic(before.markdown);
    const shown = (comparison: Comparison) => ({ comparison, restorable });
    if (!visible(after) || !visible(before)) return shown({ kind: "hidden" });
    const github = from ? `https://github.com/${repo}/compare/${from.sha}...${to.sha}` : to.url;
    if (after.kind === "too-large" || before.kind === "too-large") return shown({ kind: "too-large", github });
    const hunks = diffLines(before.kind === "file" ? before.markdown : "", after.kind === "file" ? after.markdown : "");
    if (!hunks) return shown({ kind: "too-large", github });
    const rendered = after.kind === "file"
      ? await renderRevision(after.markdown, { ...data.preview, notes: data.notes, path: note.path, base: deployment })
      : undefined;
    return shown({ kind: "diff", hunks, rendered });
  }

  /**
   * The form reverting `note` to `from`, read from the newest page of its changes, which names its head: only when
   * `from` is among them and older than the head. `undefined` too when GitHub can't be asked.
   */
  async function revertForm(note: PreviewNote, from: Commit, to: Commit, reader: CommitReader, context: PageContext): Promise<RevertForm | undefined> {
    const link = urls(context);
    let commits: readonly Commit[];
    try {
      ({ commits } = await reader.history(note.path, 0));
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      return undefined;
    }
    const undone = commits.findIndex(({ sha }) => sha === from.sha);
    const head = commits[0]?.sha;
    if (undone < 1 || !head) return undefined;
    return {
      action: `${context.base}/revert/`,
      fields: { page: note.href, revision: from.sha, head, to: to.sha },
      at: from.committedAt,
      undone,
      ...to.sha !== head && { current: `${link.history(note, { from: from.sha, to: head })}#sv-history-revert` },
      maxReason: MAX_REASON_LENGTH,
    };
  }

  async function diff(request: Request, note: PreviewNote, toSha: string, fromSha: string | null, reader: CommitReader, context: PageContext): Promise<PageResult | undefined> {
    const link = urls(context);
    const status = new URL(request.url).searchParams.get("revert");
    const page = (revisions: Parameters<typeof diffPage>[0]["revisions"], comparison: Comparison, revert?: RevertForm) =>
      diffPage({ title: note.title, revisions, comparison, status, links: { page: link.page(note), history: link.history(note) }, ...revert && { revert } });
    let to: Commit | undefined;
    let from: Commit | undefined;
    let comparison: Comparison;
    let restorable = false;
    // Without a `from`, the page says the note didn't exist before `to`; that is only known once `from` was read.
    let bothRead = false;
    try {
      to = await reader.commit(toSha);
      if (!to) return undefined;
      from = fromSha === null ? await reader.previous(note.path, to.sha) : await reader.commit(fromSha);
      if (fromSha !== null && !from) return undefined;
      bothRead = true;
      ({ comparison, restorable } = await compare(note, from, to, reader, link.deployment));
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      if (!to || !bothRead) return page(undefined, { kind: "unavailable" });
      comparison = { kind: "unavailable" };
    }
    const revert = from && restorable && await mayRevert(request, note, context) ? await revertForm(note, from, to, reader, context) : undefined;
    const [shownTo, shownFrom] = await changesOf(from ? [to, from] : [to], context);
    return page({ from: shownFrom, to: shownTo! }, comparison, revert);
  }

  /** `date` as a commit message names a revision's day: `19 Nov 2026`, in UTC. */
  const messageDay = (iso: string) => revisionDay.format(new Date(iso));

  /**
   * `POST revert/`, a form post from a diff page (`page`, `revision`, `head`, `to`, `reason`?): make the page read as it
   * did at `revision`, one of its latest 100 changes, for an account holding `history:reverts:write` on it and on every
   * page the restored frontmatter claims. Refused unless `head` is still the page's latest change on GitHub. The audit
   * entry lands once the commit exists, before the branch moves; then `restore()` records the save and takes back the
   * reputation the changes since earned, or leaves that to credit's next run when it can't. Redirects to the history on success, else back to the diff with `?revert=`.
   */
  async function revertRoute(request: Request, context: ServerContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("origin") !== url.origin) return refuse(403, "Revert pages from this site.");
    const signIn = await readSignIn(request, context.env);
    if (signIn.reason === "no-database") return refuse(503, "Reverting needs accounts, and this site has none.");
    const { account } = signIn;
    if (!account) return refuse(401, "Sign in to revert pages.");
    const form = await formOf(request);
    if (!form) return refuse(413, "This form is too large.");
    const note = notes.get(form.get("page") ?? "");
    const [revision, head, to] = [form.get("revision") ?? "", form.get("head") ?? "", form.get("to") ?? ""];
    const reason = (form.get("reason") ?? "").replace(/\s+/g, " ").trim();
    if (!note) return refuse(404, "This page has no history here.");
    if (![revision, head, to].every((sha) => SHA.test(sha)) || reason.length > MAX_REASON_LENGTH) return refuse(400, "This form didn't arrive intact. Reload the page and try again.");
    const vault = context.vault.id;
    if (!restore.commits || !await can(account, REVERT, { vault, page: note.slug }, context.env)) return refuse(403, "Your account can't revert this page.");

    const link = urls(context);
    const back = (status: string) => redirect(`${link.history(note, { from: revision, to, revert: status })}#sv-history-revert`);
    const reader = read(context);
    const writer = restore.forRequest(context);
    try {
      const { commits } = await reader.history(note.path, 0);
      if (commits[0]?.sha !== head) return back("changed");
      const index = commits.findIndex(({ sha }) => sha === revision);
      if (index === 0) return back("unchanged");
      if (index < 0) return back("too-old");
      const restored = await reader.file(note.path, revision);
      const current = await reader.file(note.path, head);
      if (restored.kind === "missing") return back("missing");
      if (restored.kind === "too-large" || current.kind !== "file") return back("too-large");
      if (!wasPublic(restored.markdown)) return back("hidden");
      if (restored.markdown === current.markdown) return back("unchanged");
      const claimed = writer.claims(note.path, restored.markdown, note.slug);
      if (!claimed || (await canEach(account, REVERT, [...claimed].map((page) => ({ vault, page })), context.env)).includes(false)) return back("route");
      const undoes = commits.slice(0, index).map(({ sha }) => sha);
      const named = `${revision.slice(0, 7)} (${messageDay(commits[index]!.committedAt)})`;
      const result = await writer.restore({
        account,
        request,
        page: { href: note.href, path: note.path },
        markdown: restored.markdown,
        current: current.markdown,
        undoes,
        title: `Revert ${repoPath(note.path)} to ${named}`,
        note: reason ? `Reverted to ${named}: ${reason}` : `Reverted to ${named}.`,
        beforeMove: (commit) => audit(context.env, {
          actor: account,
          action: "history:page:revert",
          target: `page:${vault}/${note.slug}`,
          detail: { restored: revision, replaced: head, commit: commit.sha, ...reason && { reason } },
        }),
      });
      if (result.kind !== "commit") return back(result.kind);
      return redirect(link.history(note, { status: "reverted" }));
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      return back("github");
    }
  }

  async function changes(before: string | null, reader: CommitReader, context: PageContext): Promise<PageResult> {
    const link = urls(context);
    let page: Awaited<ReturnType<CommitReader["recent"]>> = { commits: [] };
    let unavailable = false;
    try {
      page = await reader.recent(before ?? undefined);
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      unavailable = true;
    }
    reader.refresh();
    return changesPage({
      changes: await wikiChanges(page.commits, context),
      unavailable,
      ...(page.next ? { older: link.changes({ before: page.next }) } : {}),
    });
  }

  async function contributions(request: Request, handle: string, before: string | null, reader: CommitReader, context: PageContext): Promise<PageResult | undefined> {
    const link = urls(context);
    const account = await findStanding(handle, context.env);
    if (!account) return undefined;
    // An old handle: the account's page is under its current one.
    if (account.handle !== handle) return { redirect: link.contributions(account.handle, before ? { before } : undefined) };
    let made: Awaited<ReturnType<CommitReader["madeBy"]>> = { commits: [], files: [] };
    let unavailable = false;
    try {
      made = await reader.madeBy(account.id, before ? { before } : {});
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      unavailable = true;
    }
    reader.refresh();
    return contributionsPage({
      name: account.name,
      handle: account.handle,
      ...(account.userPage ? { userPage: link.userPage(account.userPage) } : {}),
      reputation: await reputationFor(account, request, context),
      changes: await wikiChanges(made.commits, context),
      pages: publishedPages(made.files, context),
      unavailable,
      ...(made.next ? { older: link.contributions(account.handle, { before: made.next }) } : {}),
    });
  }

  /** `GET contributions/?page=<path>`: the section below the user page at `path`, or 404 for any other page. */
  async function section(request: Request, context: ServerContext): Promise<Response> {
    // A user page may be in any note format; only Markdown ones have a history of their own.
    const note = everyNote.get(new URL(request.url).searchParams.get("page") ?? "");
    const handle = note && userPageHandle(note, context);
    const account = handle === undefined ? undefined : await findStanding(handle, context.env);
    if (!account) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    const reader = read(context);
    let made: Awaited<ReturnType<CommitReader["madeBy"]>>;
    try {
      // A whole page of edits, not the few shown: those to pages the site keeps back fall out of the list below.
      made = await reader.madeBy(account.id);
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
    }
    reader.refresh();
    const html = contributionsSection({
      name: account.name,
      handle: account.handle,
      changes: (await wikiChanges(made.commits, context)).slice(0, SECTION_CHANGES),
      pages: publishedPages(made.files, context).slice(0, SECTION_PAGES),
      all: urls(context).contributions(account.handle),
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
  }

  const routes = new Map([
    ["/contributions/", { method: "GET", run: section }],
    ["/revert/", { method: "POST", run: revertRoute }],
  ]);

  return {
    handle: async (request, context) => {
      const route = routes.get(new URL(request.url).pathname.slice(context.base.length));
      if (!route) return undefined;
      if (request.method !== route.method) {
        return Response.json({ error: "method_not_allowed", message: `Use ${route.method}.` }, { status: 405, headers: { allow: route.method } });
      }
      return route.run(request, context);
    },
    page: async (request, context) => {
      const query = new URL(request.url).searchParams;
      const reader = read(context);
      if (context.path === "changes/") {
        const before = query.get("before");
        if (before !== null && !SHA.test(before)) return undefined;
        return changes(before, reader, context);
      }
      const contributor = CONTRIBUTIONS.exec(context.path);
      if (contributor) {
        const before = query.get("before");
        if (before !== null && !SHA.test(before)) return undefined;
        return contributions(request, contributor[1]!, before, reader, context);
      }
      if (!context.path.startsWith("history/")) return undefined;
      const note = notes.get(`${context.vault.mountPath}${context.path.slice("history".length)}`);
      if (!note) return undefined;
      const to = query.get("to");
      if (to !== null) {
        const from = query.get("from");
        if (!SHA.test(to) || (from !== null && !SHA.test(from))) return undefined;
        return diff(request, note, to, from, reader, context);
      }
      const page = query.get("page") ?? "0";
      if (!PAGE_NUMBER.test(page) || Number(page) > MAX_HISTORY_PAGE) return undefined;
      return listPage(request, note, Number(page), reader, context);
    },
  };
};

export default history;

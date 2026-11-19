/**
 * My submissions: the dashboard panel where a reader follows the pull requests their saves opened, and the routes it
 * and the editor use to answer them. Only with `sync`: everything shown is read from the mirror, never from GitHub
 * while the page renders, and a stale mirror is refreshed by the reconcile poll after the answer.
 *
 * - `/-/dashboard/submissions/mine/` lists the reader's submissions, open ones first, then newest first, 20 a page.
 * - `/-/dashboard/submissions/mine/<number>/` shows one: where it stands, its reviews, its conversation and its diff
 *   comment threads, with forms to reply.
 * - `POST reply/` (a form: `pull`, `thread`?, `body`) posts a reply through the App, under the attribution header, on
 *   the conversation or in a diff comment thread, then redirects back with `?status=<code>`.
 * - `GET follow-up/source/?pull=<number>` answers the submission's file as its branch holds it now, for the editor.
 * - `POST follow-up/` (JSON: `pull`, `markdown`, `note`?, `sha`) commits a follow-up edit to the submission's branch.
 *
 * A submission belongs to the account `submissions_edits` names as the owner of the save that opened it; nothing a
 * pull request says (its text, branch or trailers) decides that. The owner, while they hold `FOLLOW_OWN`, sees it
 * and replies on it, and pushes follow-ups while they may still suggest edits to its page. Whoever holds
 * `submissions:reviews:write` on its page may reply on and push to anyone's. A pull request this vault's site never
 * opened is nobody's here. Every write checks the request's `Origin`, counts against the reader's rate limit, and
 * re-checks all of this on the server.
 */
import { can, findProfiles, readAccount, userPageLocation, type Account } from "@svartz/auth/server";
import type { DashboardPanel, ServerContext } from "@svartz/core";
import { pathRoute } from "@svartz/plugins/routes";
import { MAX_MARKDOWN_BYTES, MAX_NOTE_LENGTH, PLUGIN_ID, type EditResponse, type LinkTarget } from "./api";
import { attributed, header, MAX_REPLY_LENGTH, postedText, type Sender } from "./attribution";
import { SubmissionError } from "./errors";
import {
  commitSubmission,
  postComment,
  readPullRequest,
  readSource,
  sameRepository,
  submissionBranch,
  type Attribution,
  type GitHubTarget,
  type Person,
} from "./github";
import type { createGuard } from "./guard";
import { readSubmission, writeComment, type EditRecord, type Mirror } from "./mirror";
import { FOLLOW_OWN, OPEN_PULL_REQUESTS, REVIEW } from "./permissions";
import { comment as commentRecord } from "./records";
import { readBody } from "./request";
import { listPage, submissionPage, type Author, type Comment, type Entry, type ListedSubmission } from "./submission-page";
import type { Sync } from "./sync";

/** The panel's id below the plugin's: `/-/dashboard/submissions/mine/`. */
export const MY_SUBMISSIONS_PANEL = "mine";
const PAGE_SIZE = 20;
/** Comments a submission's view shows at most, the newest; GitHub has the rest. */
const MAX_COMMENTS = 500;
const MAX_REQUEST_BYTES = MAX_MARKDOWN_BYTES + MAX_NOTE_LENGTH * 4 + 4096;
const BLOB_SHA = /^[0-9a-f]{40}$/;
const POSITIVE = /^[1-9]\d{0,9}$/;

/** What the panel needs from the rest of the server module. */
export interface MySubmissionsSetup {
  readonly repo: string;
  /** The vault's folder in the repository, `""` at its root. */
  readonly vaultRoot: string;
  /** The published notes, by which an edited page's title, slug and address are found. */
  readonly links: readonly LinkTarget[];
  readonly sync: Sync;
  readonly guard: ReturnType<typeof createGuard>;
  readonly github: (context: ServerContext) => Promise<GitHubTarget>;
  /** The App's bot user, which commits; without an App, follow-ups are off. */
  readonly committer?: (env: ServerContext["env"]) => Promise<Person>;
  readonly attribution: (account: Account, committer: Person, request: Request, context: ServerContext) => Promise<Attribution>;
  /** The public URL of a path below the deployment base. */
  readonly publicUrl: (route: string, request: Request, context: ServerContext) => string;
}

/** What a reader may do with a submission: follow it as its owner, act on it as a reviewer, or neither. */
interface Access {
  readonly owner: boolean;
  readonly reviewer: boolean;
}

const json = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status, headers: { "cache-control": "no-store" } });

/**
 * Two columns of a list of pull requests, for the pull request whose scope and number are the SQL expressions `scope`
 * and `number`: `verdict`, what its reviewers decided, and `comments`, how many comments it has. The verdict counts
 * each reviewer's latest decision, as GitHub does: comments and dismissed reviews decide nothing, and one reviewer's
 * approval doesn't clear another's request for changes. A verdict the site posted is its account's decision, even
 * where GitHub holds it as a comment (`submissions_decisions`).
 */
export const verdictAndComments = (scope: string, number: string) => `(SELECT CASE WHEN MAX(d.decision = 'changes_requested') THEN 'changes_requested' WHEN COUNT(*) > 0 THEN 'approved' END
    FROM submissions_decisions d WHERE d.scope = ${scope} AND d.pull_number = ${number} AND d.decision IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM submissions_decisions l WHERE l.scope = d.scope AND l.pull_number = d.pull_number
        AND l.reviewer IS d.reviewer AND l.decision IS NOT NULL
        AND (l.submitted_at > d.submitted_at OR (l.submitted_at = d.submitted_at AND l.id > d.id)))) AS verdict,
  (SELECT COUNT(*) FROM submissions_comments c WHERE c.scope = ${scope} AND c.pull_number = ${number} AND c.deleted = 0) AS comments`;

/**
 * Whether `body`, as GitHub holds it, is still exactly what the site posted: `header`, then `typed` after a blank line
 * when there is any. Only then is it shown as the account that wrote it; an edit on GitHub shows as it is.
 */
const asPosted = (body: string, header: string | null, typed: string | null): boolean =>
  header !== null && typed !== null && body === (typed ? attributed(header, typed) : header);

/**
 * Pull request `number`'s conversation from the mirror, in time order, with what the site posted shown as the account
 * that wrote it, with its reputation: the newest {@link MAX_COMMENTS} comments and the first comment of each thread
 * they're in, and whether there are earlier ones. The Submissions review panel shows the same conversation.
 */
export async function conversation(mirror: Mirror, number: number, env: ServerContext["env"]): Promise<{ entries: Entry[]; earlier: boolean }> {
  const [{ results: reviews }, { results: comments }, { results: [count] }] = await Promise.all([
    mirror.db.prepare(`SELECT r.state, r.author_login, r.body, r.url, r.submitted_at, p.account, p.name, p.role, p.header, p.body AS typed
      FROM submissions_reviews r LEFT JOIN submissions_posted_reviews p ON p.scope = r.scope AND p.id = r.id
      WHERE r.scope = ? AND r.pull_number = ? AND r.submitted_at IS NOT NULL AND r.state <> 'pending' ORDER BY r.submitted_at, r.id`)
      .bind(mirror.scope, number).all<{
        state: string; author_login: string | null; body: string; url: string; submitted_at: string;
        account: string | null; name: string | null; role: string | null; header: string | null; typed: string | null;
      }>(),
    // A thread's first comment says where it is and takes its replies, so it comes along however old it is.
    mirror.db.prepare(`WITH recent AS (SELECT * FROM submissions_comments WHERE scope = ?1 AND pull_number = ?2 AND deleted = 0
        ORDER BY created_at DESC, id DESC LIMIT ?3)
      SELECT c.kind, c.id, c.author_login, c.body, c.path, c.line, c.in_reply_to, c.url, c.created_at,
        r.account, r.name, r.role, r.header, r.body AS typed
      FROM (SELECT * FROM recent UNION SELECT * FROM submissions_comments WHERE scope = ?1 AND pull_number = ?2 AND deleted = 0
        AND kind = 'review' AND id IN (SELECT in_reply_to FROM recent WHERE kind = 'review')) c
      LEFT JOIN submissions_replies r ON r.scope = c.scope AND r.kind = c.kind AND r.id = c.id
      ORDER BY c.created_at, c.id`)
      .bind(mirror.scope, number, MAX_COMMENTS)
      .all<{
        kind: "issue" | "review"; id: number; author_login: string | null; body: string; path: string | null; line: number | null;
        in_reply_to: number | null; url: string; created_at: string;
        account: string | null; name: string | null; role: string | null; header: string | null; typed: string | null;
      }>(),
    mirror.db.prepare("SELECT COUNT(*) AS comments FROM submissions_comments WHERE scope = ? AND pull_number = ? AND deleted = 0")
      .bind(mirror.scope, number).all<{ comments: number }>(),
  ]);
  // What the site posted names an account; one lookup gives every one of them its reputation, as it stands now.
  const posted = [...reviews, ...comments].filter((row) => row.account !== null && asPosted(row.body, row.header, row.typed));
  const profiles = posted.length > 0 ? await findProfiles([...new Set(posted.map(({ account }) => account!))], env) : new Map();
  const authorOf = (row: { author_login: string | null; account: string | null; name: string | null; role: string | null }, ours: boolean): Author => {
    if (!ours) return { login: row.author_login };
    const reputation = profiles.get(row.account!)?.reputation;
    return { name: row.name!, role: row.role!, ...(reputation === undefined ? {} : { reputation }) };
  };
  const timeline: Entry[] = reviews
    // A review that only holds diff comments says nothing of its own; its comments show in their threads.
    .filter(({ state, body }) => state !== "commented" || body.trim())
    .map((row) => {
      const ours = asPosted(row.body, row.header, row.typed);
      return { kind: "review", author: authorOf(row, ours), state: row.state, body: ours ? row.typed! : row.body, at: row.submitted_at, url: row.url };
    });

  const threads = new Map<number, { path: string | null; line: number | null; comments: Comment[]; open: boolean; at: string }>();
  for (const row of comments) {
    const ours = asPosted(row.body, row.header, row.typed);
    const author = authorOf(row, ours);
    const shown: Comment = { id: row.id, author, body: ours ? row.typed! : row.body, at: row.created_at, url: row.url };
    if (row.kind === "issue") {
      timeline.push({ kind: "comment", comment: shown });
      continue;
    }
    const root = row.in_reply_to ?? row.id;
    const thread = threads.get(root) ?? { path: row.path, line: row.line, comments: [], open: false, at: row.created_at };
    threads.set(root, thread);
    if (row.id === root) {
      // The first comment says where the thread is, and replies go to it: it was read, so it isn't deleted.
      Object.assign(thread, { path: row.path, line: row.line, open: true, at: row.created_at });
    }
    thread.comments.push(shown);
  }
  for (const [root, { path, line, comments: said, open, at }] of threads) {
    timeline.push({ kind: "thread", path, line, comments: said, at, ...(open ? { replyTo: root } : {}) });
  }
  const time = (entry: Entry) => (entry.kind === "comment" ? entry.comment.at : entry.at);
  return { entries: timeline.sort((a, b) => time(a).localeCompare(time(b))), earlier: count!.comments > MAX_COMMENTS };
}

export function createMySubmissions(setup: MySubmissionsSetup) {
  const byPath = new Map(setup.links.map((link) => [link.path, link]));

  /** `/-/dashboard/submissions/mine/`, from the plugin's `/_svartz/submissions` base. */
  const panelPath = (context: ServerContext) => `${context.base.slice(0, -`/_svartz/${PLUGIN_ID}`.length)}/-/dashboard/${PLUGIN_ID}/${MY_SUBMISSIONS_PANEL}/`;

  /** The file's path inside the vault. */
  const vaultPath = ({ path }: Pick<EditRecord, "path">) => (setup.vaultRoot ? path.slice(setup.vaultRoot.length + 1) : path);
  /** An edit's `page` is the edited note's route, which starts with a slash; a new page's is its repository path. */
  const kindOf = ({ page }: Pick<EditRecord, "page">) => (page.startsWith("/") ? "edit" as const : "new" as const);
  /** The page the file publishes as in this build, whatever address the submission was saved under. */
  const publishedAs = (edit: Pick<EditRecord, "path">) => byPath.get(vaultPath(edit));
  /** The page the submission writes, as permissions name it: as published now, or, for a file not published, its path's route. */
  const slugOf = (edit: EditRecord) => publishedAs(edit)?.slug ?? pathRoute(vaultPath(edit));
  /** What the reader calls it: the published page's title, or the new page's name. */
  function titleOf(edit: Pick<EditRecord, "path">): string {
    const path = vaultPath(edit);
    return publishedAs(edit)?.title ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  }

  async function access(account: Account, edit: EditRecord, context: ServerContext): Promise<Access> {
    const vault = context.vault.id;
    const [owner, reviewer] = await Promise.all([
      edit.owner === `account:${account.id}` && can(account, FOLLOW_OWN, { vault }, context.env),
      can(account, REVIEW, { vault, page: slugOf(edit) }, context.env),
    ]);
    return { owner, reviewer };
  }

  /** The account's user page on the site, when this vault holds user pages and has published theirs. */
  function userPage(account: Account, request: Request, context: ServerContext): string | undefined {
    const { vault, folder } = userPageLocation();
    if (vault !== context.vault.id) return undefined;
    const page = setup.links.find(({ slug }) => slug === `${folder}/${account.handle}`);
    return page && setup.publicUrl(page.href, request, context);
  }

  // --- The panel ---

  async function list(request: Request, context: ServerContext, account: Account, mirror: Mirror) {
    const requested = Number(new URL(request.url).searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
    const { results } = await mirror.db.prepare(`SELECT e.page, e.path, e.pull_number, e.saved_at, p.state, p.merged_at,
        ${verdictAndComments("e.scope", "e.pull_number")}
      FROM submissions_edits e LEFT JOIN submissions_pulls p ON p.scope = e.scope AND p.number = e.pull_number
      WHERE e.scope = ?1 AND e.owner = ?2 AND e.kind = 'pull-request'
      ORDER BY CASE WHEN p.state = 'closed' THEN 1 ELSE 0 END, e.saved_at DESC, e.id
      LIMIT ?3 OFFSET ?4`)
      .bind(mirror.scope, `account:${account.id}`, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)
      .all<{ page: string; path: string; pull_number: number; saved_at: string; state: string | null; merged_at: string | null; verdict: ListedSubmission["verdict"]; comments: number }>();
    const here = panelPath(context);
    const submissions = results.slice(0, PAGE_SIZE).map((row): ListedSubmission => ({
      number: row.pull_number,
      title: titleOf(row),
      kind: kindOf(row),
      // Not mirrored yet: just opened.
      state: row.merged_at ? "merged" : row.state === "closed" ? "closed" : "open",
      verdict: row.verdict,
      comments: row.comments,
      savedAt: row.saved_at,
      href: `${here}${row.pull_number}/`,
    }));
    return listPage({ submissions, here, page, more: results.length > PAGE_SIZE });
  }

  async function view(request: Request, context: ServerContext, account: Account, mirror: Mirror, number: number) {
    const edit = await readSubmission(mirror, number);
    // Only its owner sees a submission here; anyone else's is no submission at all.
    if (!edit || edit.owner !== `account:${account.id}`) return undefined;
    const [{ stage }, { entries, earlier }] = await Promise.all([setup.sync.progress(context, mirror, edit), conversation(mirror, number, context.env)]);
    const query = new URL(request.url).searchParams;
    const code = query.get("status");
    const thread = query.get("thread");
    const retry = query.get("retry");
    const mayEdit = stage === "open" && setup.committer !== undefined
      && await can(account, OPEN_PULL_REQUESTS, { vault: context.vault.id, page: slugOf(edit) }, context.env);
    const published = publishedAs(edit);
    const page = published && setup.publicUrl(published.href, request, context);
    return submissionPage({
      number,
      title: titleOf(edit),
      kind: kindOf(edit),
      stage,
      url: edit.url,
      ...(page ? { pageUrl: page } : {}),
      entries,
      earlier,
      back: panelPath(context),
      replyAction: `${context.base}/reply/`,
      ...(mayEdit ? { followUp: vaultPath(edit) } : {}),
      ...(code
        ? { status: { code, ...(thread && POSITIVE.test(thread) ? { thread: Number(thread) } : {}), ...(retry && POSITIVE.test(retry) ? { retry: Number(retry) } : {}) } }
        : {}),
    });
  }

  const panel: DashboardPanel = {
    id: MY_SUBMISSIONS_PANEL,
    title: "My submissions",
    permission: FOLLOW_OWN,
    async render(request, context) {
      // The dashboard checked FOLLOW_OWN just now, which only accounts hold.
      const account = await readAccount(request, context.env);
      if (!account) return undefined;
      const mirror = await setup.sync.mirrorFor(context);
      if (context.path === "") {
        setup.sync.refresh(context, mirror);
        return list(request, context, account, mirror);
      }
      const number = context.path.match(/^(\d{1,10})\/$/)?.[1];
      return number ? view(request, context, account, mirror, Number(number)) : undefined;
    },
  };

  // --- Routes ---

  /** The signed-in account, from a request that came from this site's own pages. */
  async function writer(request: Request, context: ServerContext, method: string): Promise<Account> {
    // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
    if (method === "POST" && request.headers.get("origin") !== new URL(request.url).origin) {
      throw new SubmissionError("cross_origin", 403, "Answer submissions from this site.");
    }
    const account = await readAccount(request, context.env);
    if (!account) throw new SubmissionError("sign_in_required", 401, "Sign in to answer your submissions.");
    return account;
  }

  /** Submission `number` and what `account` may do with it; someone else's, or no submission of this vault, is 404. */
  async function submission(account: Account, number: number, context: ServerContext) {
    const mirror = await setup.sync.mirrorFor(context);
    const edit = await readSubmission(mirror, number);
    const allowed = edit && await access(account, edit, context);
    if (!edit || !allowed || (!allowed.owner && !allowed.reviewer)) {
      throw new SubmissionError("not_found", 404, "This site has no submission of yours with that number.");
    }
    return { mirror, edit, access: allowed };
  }

  async function reply(request: Request, context: ServerContext): Promise<Response> {
    const account = await writer(request, context, "POST");
    const form = await request.formData().catch(() => undefined);
    const field = (name: string) => String(form?.get(name) ?? "");
    const [pull, thread] = [field("pull"), field("thread")];
    if (!POSITIVE.test(pull) || (thread !== "" && !POSITIVE.test(thread))) return json(400, "invalid_request", "Your reply didn't arrive intact. Reload the page and try again.");
    const number = Number(pull);
    const replyTo = thread === "" ? undefined : Number(thread);
    const { mirror, edit, access: { owner } } = await submission(account, number, context);

    /** Back to the submission, saying how the reply went, at the form it came from or the reply it made. */
    const back = (status: string, extra: Record<string, string> = {}, anchor = replyTo === undefined ? "svartz-reply" : `svartz-reply-${replyTo}`) => {
      const target = new URL(`${panelPath(context)}${number}/`, request.url);
      target.searchParams.set("status", status);
      if (replyTo !== undefined) target.searchParams.set("thread", String(replyTo));
      for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value);
      return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}#${anchor}`, "cache-control": "no-store" } });
    };

    const typed = field("body").replace(/\r\n?/g, "\n").trim();
    if (!typed) return back("empty");
    if (typed.length > MAX_REPLY_LENGTH) return back("too-long");
    if (replyTo !== undefined) {
      // Replies go only to the first comment of a thread on this pull request, as GitHub takes them.
      const { results: [root] } = await mirror.db.prepare(`SELECT 1 AS found FROM submissions_comments
        WHERE scope = ? AND kind = 'review' AND id = ? AND pull_number = ? AND in_reply_to IS NULL AND deleted = 0`)
        .bind(mirror.scope, replyTo, number).all();
      if (!root) return back("thread-gone");
    }
    try {
      await setup.guard.limit(`follow-up:account:${account.id}`, context.env, "replies");
    } catch (error) {
      if (error instanceof SubmissionError && error.code === "rate_limited") return back("rate-limited", { retry: String(error.retryAfter ?? 60) });
      throw error;
    }

    const page = userPage(account, request, context);
    const sender: Sender = {
      name: account.name,
      handle: account.handle,
      role: owner ? "submitter" : account.roles[0] ?? "reviewer",
      ...(page ? { userPage: page } : {}),
    };
    const heading = header(sender, new URL(request.url).hostname);
    const text = postedText(typed);
    let made: unknown;
    try {
      made = await postComment(await setup.github(context), number, attributed(heading, text), replyTo);
    } catch (error) {
      if (!(error instanceof SubmissionError)) throw error;
      console.error(`[submissions] couldn't post a reply on pull request #${number}`, error.message);
      return back(error.code === "thread_gone" ? "thread-gone" : "github");
    }
    // Shown at once, before GitHub's delivery of the same comment arrives.
    const record = commentRecord(made, replyTo === undefined ? "issue" : "review", number);
    if (!record) return back("sent");
    await mirror.db.batch([
      writeComment(mirror, record),
      mirror.db.prepare(`INSERT OR IGNORE INTO submissions_replies (scope, kind, id, account, name, role, header, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(mirror.scope, record.kind, record.id, account.id, account.name, sender.role, heading, text),
    ]);
    return back("sent", {}, `comment-${record.id}`);
  }

  /**
   * Submission `number` for a follow-up edit by `account`, with its branch as GitHub holds it now. Refused unless the
   * account owns it and may still suggest edits to its page, or reviews it; unless the site has an App to commit
   * with; and unless the pull request is open and comes from the branch the site made for this submission.
   */
  async function followable(account: Account, number: number, context: ServerContext) {
    const { edit, access: { owner, reviewer } } = await submission(account, number, context);
    const suggests = owner && await can(account, OPEN_PULL_REQUESTS, { vault: context.vault.id, page: slugOf(edit) }, context.env);
    if (!suggests && !reviewer) throw new SubmissionError("not_allowed", 403, "Your account can't edit this submission.");
    if (!setup.committer) throw new SubmissionError("misconfigured", 503, "This site can't take follow-up edits: they need a GitHub App.");
    const github = await setup.github(context);
    const pull = await readPullRequest(github, number);
    if (!pull?.open) throw new SubmissionError("closed", 409, "This submission is closed, so it takes no more edits.");
    const branches = (["edit", "new"] as const).map((kind) => submissionBranch({ kind, page: edit.page, id: edit.id }));
    if (!branches.includes(pull.headRef) || !sameRepository(pull.headRepo, setup.repo)) {
      throw new SubmissionError("not_found", 404, "This site has no submission of yours with that number.");
    }
    return { edit, github, branch: pull.headRef, head: pull.headSha };
  }

  async function followUpSource(request: Request, context: ServerContext): Promise<Response> {
    const account = await writer(request, context, "GET");
    const pull = new URL(request.url).searchParams.get("pull") ?? "";
    if (!POSITIVE.test(pull)) throw new SubmissionError("invalid_request", 400, "Name the submission by its number.");
    const { edit, github, head } = await followable(account, Number(pull), context);
    const { markdown, sha } = await readSource({ ...github, commit: head }, edit.path);
    return Response.json({ markdown, sha, path: vaultPath(edit) }, { headers: { "cache-control": "private, no-store" } });
  }

  async function followUp(request: Request, context: ServerContext): Promise<Response> {
    const account = await writer(request, context, "POST");
    const bytes = await readBody(request, MAX_REQUEST_BYTES);
    if (!bytes) throw new SubmissionError("too_large", 413, "This page is too large to submit from the site.");
    let body: Record<string, unknown> | undefined;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    } catch {
      body = undefined;
    }
    const { pull, markdown, note = "", sha } = body ?? {};
    if (
      typeof pull !== "number" || !Number.isSafeInteger(pull) || pull < 1 || typeof markdown !== "string" || typeof note !== "string"
      || typeof sha !== "string" || !BLOB_SHA.test(sha)
    ) {
      throw new SubmissionError("invalid_request", 400, "Your changes didn't arrive intact. Reload the page and try again.");
    }
    if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) throw new SubmissionError("too_large", 413, "This page is too large to submit from the site.");
    if (note.length > MAX_NOTE_LENGTH) throw new SubmissionError("note_too_long", 400, `Shorten the note to ${MAX_NOTE_LENGTH.toLocaleString("en")} characters or fewer.`);
    const { edit, github, branch } = await followable(account, pull, context);
    await setup.guard.limit(`follow-up:account:${account.id}`, context.env);
    const by = await setup.attribution(account, await setup.committer!(context.env), request, context);
    // The branch in place of the content branch: the same never-overwrite commit, onto the submission.
    const committed = await commitSubmission(
      { ...github, branch },
      { kind: "edit", id: edit.id, path: edit.path, page: edit.page, pageUrl: edit.url, markdown, note, submitter: account.identity },
      sha,
      by,
    );
    if (committed.kind === "review") {
      if (committed.reason === "protected") throw new SubmissionError("protected", 403, "The repository's rules don't let the site add to this submission.");
      throw new SubmissionError("changed", 409, "This page changed in the submission since you opened it. Copy your changes, then reopen the editor.");
    }
    return Response.json({ kind: "commit", url: committed.url, sha: committed.sha } satisfies EditResponse, { status: 201 });
  }

  return {
    panel,
    routes: [
      ["/reply/", { method: "POST", run: reply }],
      ["/follow-up/source/", { method: "GET", run: followUpSource }],
      ["/follow-up/", { method: "POST", run: followUp }],
    ] as const,
  };
}

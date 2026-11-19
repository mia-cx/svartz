/**
 * The Submissions review panel: where reviewers read, answer and decide open submissions on the site. Only with
 * `sync` and accounts, for viewers holding `submissions:reviews:write` on the vault.
 *
 * - `/-/dashboard/submissions/review/` lists the open pull requests into the content branch that change the vault, as
 *   the mirror holds them, newest activity first, 25 a page: who sent each, what its reviewers decided, and how many
 *   comments it has.
 * - `/-/dashboard/submissions/review/<number>/` shows one as My submissions does (`submission-page.ts`), with each
 *   changed file the reviewer may review: GitHub's diff of it, and the page at the pull request's head rendered with
 *   the build's Markdown steps and sanitizer (`render.ts`), its content read through the commit reader.
 * - `POST review/comment/` (`pull`, `thread`?, `body`) comments on the conversation or in a diff thread;
 *   `POST review/line/` (`pull`, `head`, `file`, `at`, `body`) on a line of the diff; `POST review/verdict/`
 *   (`pull`, `head`, `event`, `body`?) approves or requests changes; `POST review/merge/` (`pull`, `head`) merges.
 *   Each redirects back to the submission with `?status=` (comments) or `?review=` (the rest). A submission the site
 *   saved also offers Close, which posts to the plugin's `close/` route and comes back to the list.
 *
 * A file is shown only when the reviewer holds `submissions:reviews:write` on the page it publishes as now, or would
 * publish as; a file outside the vault needs the permission on the whole site. While the pull request is open, a page
 * also needs the permission on every route its content at the head claims (`claims`, as a save's commit checks them),
 * so merging can't hand it a page the reviewer may not review; a page whose head can't be read counts as one they may
 * not. Other files are counted, never named, and neither are diff threads on them. Every action needs the permission
 * on every file the pull request changes, at the head GitHub holds now, which must be the head the reviewer looked at
 * for anything but a comment.
 *
 * Every action posts through the App under the attribution header (`attribution.ts`), only on a pull request the
 * mirror holds for this vault that GitHub still has in this repository, into the content branch. Each writes an
 * audit entry once GitHub's state is checked and before GitHub is asked to change anything; a refused action writes
 * none. Every POST checks `Origin`, the session and the permission again, and counts against the reader's rate limit.
 * What GitHub took stays posted even when the site's own record of it fails: its delivery fills the mirror anyway.
 *
 * The view reads GitHub within the pause the reconcile poll shares (`reconcile.ts`), as the commit reader does; while
 * it holds, the view shows the conversation without the changes.
 */
import { audit, can, findProfiles, readAccount, userPageLocation, type Account } from "@svartz/auth/server";
import type { DashboardPanel, ServerContext } from "@svartz/core";
import { pathRoute } from "@svartz/plugins/routes";
import { PLUGIN_ID, type EditStage, type LinkTarget, type PreviewSettings } from "./api";
import { attributed, header, MAX_REPLY_LENGTH, postedText, type Sender } from "./attribution";
import { CommitsUnavailable, type CommitReader, type FileAt } from "./commits";
import { SubmissionError } from "./errors";
import {
  baseBranch,
  mergeMethod,
  mergePull,
  postComment,
  postLineComment,
  readChanges,
  readPullRequest,
  sameRepository,
  submitReview,
  unavailable,
  type ChangedFile,
  type GitHubTarget,
  type PullState,
  type ReviewEvent,
} from "./github";
import type { createGuard } from "./guard";
import { readBranch, readSubmission, writeComment, writeReview, type Mirror, type Statement } from "./mirror";
import { conversation, verdictAndComments } from "./my-submissions";
import { REVIEW } from "./permissions";
import { pause, resumeAt } from "./reconcile";
import { comment as commentRecord, inVault, review as reviewRecord } from "./records";
import { renderRevision } from "./render";
import { changesSection, reviewListPage, reviewSection, type ActionStatus, type DiffLine, type ReviewedFile, type ReviewRow, type Submitter } from "./review-page";
import { submissionPage, type Entry, type ReviewVerdict } from "./submission-page";
import type { Sync } from "./sync";

/** The panel's id below the plugin's: `/-/dashboard/submissions/review/`. */
export const REVIEW_PANEL = "review";
const PAGE_SIZE = 25;
/**
 * Pages a request checks the reviewer's permission on. Each check is a D1 query, and a free Worker gets 50 a request:
 * a pull request changing more pages than this is reviewed on GitHub.
 */
export const MAX_CHECKED_PAGES = 20;
const POSITIVE = /^[1-9]\d{0,9}$/;
const SHA = /^[0-9a-f]{40}$/;
const LINE = /^(LEFT|RIGHT):([1-9]\d{0,6})$/;
const MARKDOWN = /\.md$/i;
/** Every format the build publishes as a note, and so reads route claims from. */
const NOTE = /\.(?:md|mdx|svx)$/i;

/** What the panel needs from the rest of the server module. */
export interface ReviewSetup {
  readonly repo: string;
  /** The configured content branch; the repository's default branch when unset. */
  readonly branch?: string;
  /** The vault's folder in the repository, `""` at its root. */
  readonly vaultRoot: string;
  /** The published notes, by which a changed file's page is found, and which rendered pages link to. */
  readonly links: readonly LinkTarget[];
  readonly preview: PreviewSettings;
  /**
   * The pages a page's Markdown at a vault path claims, as permissions name them, when it publishes as page `self` now;
   * `undefined` when the build would refuse its frontmatter. The same reading a save's commit checks.
   */
  readonly claims: (vaultPath: string, markdown: string, self: string | undefined) => ReadonlySet<string> | undefined;
  readonly sync: Sync;
  readonly guard: ReturnType<typeof createGuard>;
  readonly github: (context: ServerContext) => Promise<GitHubTarget>;
  /** Reads file contents within the requests the site keeps for saves. */
  readonly reader: (context: ServerContext) => CommitReader;
  /** The public URL of a path below the deployment base. */
  readonly publicUrl: (route: string, request: Request, context: ServerContext) => string;
}

/** A file a pull request changes, and whether the reviewer may review it. */
interface Judged {
  readonly file: ChangedFile;
  readonly reviewable: boolean;
  /** A page's Markdown at the head, as read to check what it claims: only for a page of an open pull request. */
  readonly markdown?: string;
  /** Not reviewable only because GitHub couldn't be asked for its head. */
  readonly unread?: boolean;
}

/** A pull request as GitHub holds it now, with the files it changes and whether the reviewer may review each. */
interface Inspected {
  readonly github: GitHubTarget;
  readonly pull: PullState;
  readonly files: readonly Judged[];
  readonly complete: boolean;
  /** Whether the reviewer may act on it: they may review every file, and GitHub listed them all. */
  readonly mayAct: boolean;
}

/** Whether a reviewer may review a page, each page asked once a request. */
interface Reviewer {
  /** The page permissions call `slug`, or with `undefined`, the whole site. */
  page(slug: string | undefined): Promise<boolean>;
  /** The file at repository path `path`: its page, or the whole site for a file outside the vault. */
  path(path: string): Promise<boolean>;
}

/** The answer for a number that names no pull request of this vault the site can act on. */
const notFound = () => new SubmissionError("not_found", 404, "This site has no open submission with that number.");

/** GitHub's diff of one file, as hunks of numbered lines. */
export function hunksOf(patch: string): DiffLine[][] {
  const hunks: DiffLine[][] = [];
  let old = 0;
  let next = 0;
  for (const line of patch.split("\n")) {
    const start = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (start) {
      old = Number(start[1]);
      next = Number(start[2]);
      hunks.push([]);
      continue;
    }
    const hunk = hunks.at(-1);
    // `\ No newline at end of file` marks the line before it.
    if (!hunk || line === "" || line.startsWith("\\")) continue;
    const text = line.slice(1);
    if (line[0] === "+") hunk.push({ kind: "add", text, new: next++ });
    else if (line[0] === "-") hunk.push({ kind: "del", text, old: old++ });
    else hunk.push({ kind: "same", text, old: old++, new: next++ });
  }
  return hunks;
}

export function createReview(setup: ReviewSetup) {
  const byPath = new Map(setup.links.map((link) => [link.path, link]));

  /** The file's path in the vault, or `undefined` for a file outside the vault's folder. */
  const vaultPath = (path: string) => (!inVault(path, setup.vaultRoot) ? undefined : setup.vaultRoot ? path.slice(setup.vaultRoot.length + 1) : path);
  /** The page a vault file publishes as in this build, or would publish as, as permissions name it. */
  const slugOf = (path: string) => byPath.get(path)?.slug ?? pathRoute(path);

  /** The dashboard's path for this panel, from the plugin's `/_svartz/submissions` base. */
  const panelPath = (context: ServerContext) => `${context.base.slice(0, -`/_svartz/${PLUGIN_ID}`.length)}/-/dashboard/${PLUGIN_ID}/${REVIEW_PANEL}/`;

  /**
   * Whether `account` may review a page or a file. Each page is asked once a request, and only the first
   * {@link MAX_CHECKED_PAGES}; the rest count as not.
   */
  function reviewer(account: Account, context: ServerContext): Reviewer {
    const asked = new Map<string, Promise<boolean>>();
    const page = (slug: string | undefined) => {
      const key = slug === undefined ? "site" : `page:${slug}`;
      let answer = asked.get(key);
      if (!answer) {
        answer = asked.size >= MAX_CHECKED_PAGES
          ? Promise.resolve(false)
          : can(account, REVIEW, slug === undefined ? {} : { vault: context.vault.id, page: slug }, context.env);
        asked.set(key, answer);
      }
      return answer;
    };
    return {
      page,
      path: (path) => {
        const inside = vaultPath(path);
        return page(inside === undefined ? undefined : slugOf(inside));
      },
    };
  }

  /**
   * `github` reading within the scope's shared pause, as the commit reader does: no request while it holds, and an
   * answer that says to wait, or that leaves the hourly allowance at the reserve, starts it. `pausedUntil` is the pause
   * as this request read it (`readPause`).
   */
  function paced(github: GitHubTarget, mirror: Mirror, pausedUntil: number): GitHubTarget {
    let until = pausedUntil;
    return {
      ...github,
      pace: {
        async before() {
          if (until > Date.now()) throw unavailable();
        },
        async after(response) {
          const resume = await resumeAt(response, Date.now());
          if (resume === undefined) return;
          await pause(mirror, resume);
          until = Math.max(until, resume);
        },
      },
    };
  }

  /** The content branch: configured, else as the mirror or GitHub names the default branch. */
  async function contentBranch(mirror: Mirror, github: GitHubTarget): Promise<string> {
    return setup.branch ?? await readBranch(mirror) ?? baseBranch(github);
  }

  /**
   * `file`, which the reviewer may review by its paths, judged by the routes its content claims too: only a page of an
   * open pull request, whose head merging would publish, claims any. Its head is read through `reader`, within the
   * reader's allowance.
   */
  async function judge(file: ChangedFile, pull: PullState, reader: CommitReader, may: Reviewer): Promise<Judged> {
    const inside = vaultPath(file.path);
    if (!pull.open || inside === undefined || !NOTE.test(inside) || file.status === "removed") return { file, reviewable: true };
    let at: FileAt;
    try {
      at = await reader.headFile(inside, pull.headSha);
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      return { file, reviewable: false, unread: true };
    }
    if (at.kind !== "file") return { file, reviewable: false };
    // A route the page already holds, under its old path when this moves it, is no new claim.
    const before = vaultPath(file.previousPath ?? file.path);
    const pages = setup.claims(inside, at.markdown, before === undefined ? undefined : byPath.get(before)?.slug);
    if (!pages) return { file, reviewable: false };
    for (const page of pages) {
      if (!await may.page(page)) return { file, reviewable: false };
    }
    // Only Markdown renders as a preview; MDX and SVX show their diff alone.
    return MARKDOWN.test(inside) ? { file, reviewable: true, markdown: at.markdown } : { file, reviewable: true };
  }

  /**
   * Pull request `number` as GitHub holds it now, and what it changes, read through `github`. Throws `not_found` unless
   * GitHub has it in this repository, into the content branch; any other failure is GitHub's.
   */
  async function inspect(number: number, mirror: Mirror, may: Reviewer, context: ServerContext, github: GitHubTarget): Promise<Inspected> {
    const pull = await readPullRequest(github, number);
    if (!pull || !sameRepository(pull.baseRepo, setup.repo) || pull.baseRef !== await contentBranch(mirror, github)) throw notFound();
    const { files, complete } = await readChanges(github, pull.baseSha, pull.headSha);
    const allowed = await Promise.all(files.map(async (file) => await may.path(file.path) && (file.previousPath === undefined || await may.path(file.previousPath))));
    const reader = setup.reader(context);
    const judged: Judged[] = [];
    // One at a time, so the reader's allowance goes to the files in GitHub's order.
    for (const [index, file] of files.entries()) judged.push(allowed[index] ? await judge(file, pull, reader, may) : { file, reviewable: false });
    return { github, pull, files: judged, complete, mayAct: complete && judged.every(({ reviewable }) => reviewable) };
  }

  /**
   * Pull request `number` as GitHub holds it now, for a reviewer who must be able to review all of it: 403 otherwise,
   * or 503 when all that stood in the way was a page GitHub couldn't be asked for.
   */
  async function checked(number: number, mirror: Mirror, may: Reviewer, context: ServerContext): Promise<Inspected> {
    const inspected = await inspect(number, mirror, may, context, await setup.github(context));
    if (inspected.mayAct) return inspected;
    if (inspected.complete && inspected.files.every(({ reviewable, unread }) => reviewable || unread)) throw unavailable();
    throw new SubmissionError("not_allowed", 403, "You can't review every file this submission changes.");
  }

  /**
   * For the plugin's `close/` route: throws unless `account` may act on submission `number` as GitHub holds it now,
   * as every review action requires.
   */
  async function authorize(account: Account, number: number, context: ServerContext): Promise<void> {
    await checked(number, await setup.sync.mirrorFor(context), reviewer(account, context), context);
  }

  /**
   * Whether the mirror holds pull request `number` as one that changes this vault, and with it, in the same query,
   * until when the scope's reads of GitHub are paused, as `readPause` reads it.
   */
  async function mirrored(mirror: Mirror, number: number) {
    const { results: [row] } = await mirror.db.prepare(`SELECT state, title, merged_at,
        COALESCE((SELECT paused_until FROM submissions_sync s WHERE s.scope = p.scope), 0) AS paused_until
      FROM submissions_pulls p WHERE scope = ? AND number = ? AND in_vault = 1`)
      .bind(mirror.scope, number).all<{ state: string; title: string; merged_at: string | null; paused_until: number }>();
    return row;
  }

  /** What the list and the page call a submission: the published page its save edits, or else its number. */
  function titleOf(number: number, path: string | null): string {
    const inside = path === null ? undefined : vaultPath(path);
    return (inside !== undefined && byPath.get(inside)?.title) || `Pull request #${number}`;
  }
  /** A save's `page` is the edited note's route, which starts with a slash; a new page's is its repository path. */
  const kindOf = (page: string) => (page.startsWith("/") ? "edit" as const : "new" as const);

  // --- The panel ---

  async function list(request: Request, context: ServerContext, account: Account, mirror: Mirror, page: number) {
    // Who sent it is the account of the first save the site recorded for it, as for every submission.
    const { results } = await mirror.db.prepare(`WITH first AS (SELECT pull_number, owner, path, page,
          ROW_NUMBER() OVER (PARTITION BY pull_number ORDER BY saved_at, id) AS n
        FROM submissions_edits WHERE scope = ?1 AND kind = 'pull-request')
      SELECT p.number, p.author_login, p.updated_at, f.owner, f.path, f.page,
        ${verdictAndComments("p.scope", "p.number")}
      FROM submissions_pulls p LEFT JOIN first f ON f.pull_number = p.number AND f.n = 1
      WHERE p.scope = ?1 AND p.state = 'open' AND p.in_vault = 1
      ORDER BY p.updated_at DESC, p.number DESC
      LIMIT ?2 OFFSET ?3`)
      .bind(mirror.scope, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)
      .all<{
        number: number; author_login: string | null; updated_at: string; owner: string | null; path: string | null; page: string | null;
        verdict: ReviewVerdict | null; comments: number;
      }>();
    const shown = results.slice(0, PAGE_SIZE);
    const ids = [...new Set(shown.flatMap(({ owner }) => (owner?.startsWith("account:") ? [owner.slice("account:".length)] : [])))];
    const profiles = await findProfiles(ids, context.env);
    // A saved page is named only to whoever may review it.
    const may = reviewer(account, context);
    const named = await Promise.all(shown.map(({ path }) => path !== null && may.path(path)));
    const here = panelPath(context);
    const rows = shown.map((row, index): ReviewRow => {
      const profile = row.owner?.startsWith("account:") ? profiles.get(row.owner.slice("account:".length)) : undefined;
      const submitter: Submitter = profile ? { kind: "account", name: profile.name, handle: profile.handle } : { kind: "github", login: row.author_login };
      return {
        number: row.number,
        title: titleOf(row.number, named[index] ? row.path : null),
        ...(row.page === null ? {} : { kind: kindOf(row.page) }),
        submitter,
        verdict: row.verdict,
        comments: row.comments,
        updatedAt: row.updated_at,
        href: `${here}${row.number}/`,
      };
    });
    return reviewListPage({ rows, here, page, more: results.length > PAGE_SIZE });
  }

  /** Each reviewable file, with its diff and, for a page of an open pull request, the head rendered as a preview. */
  async function reviewedFiles(inspected: Inspected, context: ServerContext): Promise<ReviewedFile[]> {
    const deploymentBase = context.base.slice(0, -`${context.vault.mountPath}/_svartz/${PLUGIN_ID}`.length);
    const shown: ReviewedFile[] = [];
    for (const { file, reviewable, markdown } of inspected.files) {
      if (!reviewable) continue;
      const inside = vaultPath(file.path);
      const previous = file.previousPath === undefined ? undefined : vaultPath(file.previousPath) ?? file.previousPath;
      shown.push({
        path: file.path,
        shown: inside ?? file.path,
        ...(previous === undefined ? {} : { previous }),
        status: file.status,
        hunks: file.patch === undefined ? undefined : hunksOf(file.patch),
        ...(markdown === undefined || inside === undefined
          ? {}
          : { preview: await renderRevision(markdown, { ...setup.preview, notes: setup.links, path: inside, base: deploymentBase }) }),
      });
    }
    return shown;
  }

  /** `?review=` and the numbers beside it, as the review routes answer. */
  function actionStatus(query: URLSearchParams): ActionStatus | undefined {
    const code = query.get("review");
    if (!code) return undefined;
    const number = (name: string) => {
      const value = query.get(name);
      return value !== null && /^(?:0|[1-9]\d{0,5})$/.test(value) ? Number(value) : undefined;
    };
    const [file, retry] = [number("file"), number("retry")];
    return { code, ...(file === undefined ? {} : { file }), ...(retry === undefined ? {} : { retry }) };
  }

  async function view(request: Request, context: ServerContext, account: Account, mirror: Mirror, number: number) {
    const [row, edit] = await Promise.all([mirrored(mirror, number), readSubmission(mirror, number)]);
    if (!row) return undefined;
    const may = reviewer(account, context);
    let inspected: Inspected | undefined;
    try {
      inspected = await inspect(number, mirror, may, context, paced(await setup.github(context), mirror, row.paused_until));
    } catch (error) {
      if (!(error instanceof SubmissionError)) throw error;
      // No longer this vault's: retargeted, or gone from GitHub.
      if (error.code === "not_found") return undefined;
      console.warn(`[submissions] couldn't read pull request #${number} from GitHub: ${error.message}`);
    }
    let stage: EditStage;
    if (edit) {
      stage = (await setup.sync.progress(context, mirror, edit)).stage;
    } else {
      setup.sync.refresh(context, mirror);
      stage = row.merged_at ? "committed" : row.state === "closed" ? "closed" : "open";
    }
    // GitHub's word is newer than the mirror's, as right after a merge from here.
    if (stage === "open" && inspected && !inspected.pull.open) stage = inspected.pull.merged ? "committed" : "closed";

    const { entries, earlier } = await conversation(mirror, number);
    // A diff thread names its file: one the reviewer may not review stays out, with what it says. A file the pull
    // request changes is judged as a whole, both sides of a move; one it no longer changes, by its path.
    const judged = new Map<string, boolean>();
    for (const { file, reviewable } of inspected?.files ?? []) {
      for (const path of [file.path, file.previousPath ?? file.path]) judged.set(path, (judged.get(path) ?? true) && reviewable);
    }
    const shownEntries = (await Promise.all(entries.map(async (entry): Promise<Entry | undefined> =>
      entry.kind === "thread" && entry.path !== null && !(judged.get(entry.path) ?? await may.path(entry.path)) ? undefined : entry)))
      .filter((entry) => entry !== undefined);

    const query = new URL(request.url).searchParams;
    const status = actionStatus(query);
    const code = query.get("status");
    const thread = query.get("thread");
    const retry = query.get("retry");
    const here = panelPath(context);
    const routes = `${context.base}/review`;
    const open = inspected?.pull.open === true;
    const acts = inspected?.mayAct === true;
    const files = inspected ? await reviewedFiles(inspected, context) : [];
    // The page the site saved is named and linked only to whoever may review it.
    const saved = edit && await may.path(edit.path) ? edit.path : null;
    const published = saved === null ? undefined : vaultPath(saved);
    const page = published === undefined ? undefined : byPath.get(published);
    return submissionPage({
      number,
      // GitHub's title can name any file the pull request changes: shown only to whoever may review them all.
      title: acts && inspected!.pull.title ? inspected!.pull.title : titleOf(number, saved),
      ...(edit ? { kind: kindOf(edit.page) } : {}),
      stage,
      url: `https://github.com/${setup.repo}/pull/${number}`,
      ...(page ? { pageUrl: setup.publicUrl(page.href, request, context) } : {}),
      entries: shownEntries,
      earlier,
      back: here,
      backLabel: "Submissions",
      ...(acts ? { replyAction: `${routes}/comment/` } : {}),
      ...(code
        ? { status: { code, ...(thread && POSITIVE.test(thread) ? { thread: Number(thread) } : {}), ...(retry && POSITIVE.test(retry) ? { retry: Number(retry) } : {}) } }
        : {}),
      changes: changesSection({
        files,
        hidden: inspected ? inspected.files.length - files.length : 0,
        complete: inspected?.complete ?? true,
        unavailable: !inspected,
        comments: acts && open ? { action: `${routes}/line/`, number, head: inspected!.pull.headSha } : undefined,
        status,
      }),
      actions: reviewSection({
        decisions: acts && open
          ? {
            number,
            head: inspected!.pull.headSha,
            verdictAction: `${routes}/verdict/`,
            mergeAction: `${routes}/merge/`,
            // `close/` closes only what the site saved for this vault; a pull request opened on GitHub closes there.
            ...(edit ? { close: { action: `${context.base}/close/`, returnTo: here } } : {}),
          }
          : undefined,
        blocked: open && !acts,
        status,
      }),
    });
  }

  const panel: DashboardPanel = {
    id: REVIEW_PANEL,
    title: "Submissions",
    permission: REVIEW,
    async render(request, context) {
      // The dashboard checked this before rendering; a panel never answers on that alone.
      const account = await readAccount(request, context.env);
      if (!account || !await can(account, REVIEW, { vault: context.vault.id }, context.env)) return undefined;
      if (context.path === "") {
        const requested = new URL(request.url).searchParams.get("page") ?? "1";
        if (!POSITIVE.test(requested)) return undefined;
        return list(request, context, account, await setup.sync.read(context), Number(requested));
      }
      const number = context.path.match(/^([1-9]\d{0,9})\/$/)?.[1];
      return number ? view(request, context, account, await setup.sync.mirrorFor(context), Number(number)) : undefined;
    },
  };

  // --- Routes ---

  /** The reviewer behind a form posted from this site, and the pull request it names, which the mirror holds for this vault. */
  async function posted(request: Request, context: ServerContext) {
    // Browsers name the page's origin on every POST: anything else is forged, or from a client that can't be checked.
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new SubmissionError("cross_origin", 403, "Review submissions from this site.");
    }
    const account = await readAccount(request, context.env);
    if (!account) throw new SubmissionError("sign_in_required", 401, "Sign in to review submissions.");
    if (!await can(account, REVIEW, { vault: context.vault.id }, context.env)) {
      throw new SubmissionError("not_allowed", 403, "Your account can't review submissions here.");
    }
    const form = await request.formData().catch(() => undefined);
    const field = (name: string) => String(form?.get(name) ?? "");
    if (!POSITIVE.test(field("pull"))) throw new SubmissionError("invalid_request", 400, "Your review didn't arrive intact. Reload the page and try again.");
    const number = Number(field("pull"));
    const mirror = await setup.sync.mirrorFor(context);
    if (!await mirrored(mirror, number)) throw notFound();
    const typed = field("body").replace(/\r\n?/g, "\n").trim();

    /** Back to the submission with `params`, at `anchor`. */
    const back = (params: Record<string, string>, anchor: string) => {
      const target = new URL(`${panelPath(context)}${number}/`, request.url);
      for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
      return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}#${anchor}`, "cache-control": "no-store" } });
    };

    /** Count this action against the reviewer's limit; past it, the answer to send back instead. */
    async function limited(param: string, extra: Record<string, string>, anchor: string): Promise<Response | undefined> {
      try {
        await setup.guard.limit(`review:account:${account!.id}`, context.env, "reviews");
        return undefined;
      } catch (error) {
        if (error instanceof SubmissionError && error.code === "rate_limited") {
          return back({ [param]: "rate-limited", ...extra, retry: String(error.retryAfter ?? 60) }, anchor);
        }
        throw error;
      }
    }

    /** Who the header names: the account, its role and its user page. */
    function heading(): string {
      const { vault, folder } = userPageLocation();
      const page = vault === context.vault.id ? setup.links.find(({ slug }) => slug === `${folder}/${account!.handle}`) : undefined;
      const sender: Sender = {
        name: account!.name,
        handle: account!.handle,
        role: account!.roles[0] ?? "reviewer",
        ...(page ? { userPage: setup.publicUrl(page.href, request, context) } : {}),
      };
      return header(sender, new URL(request.url).hostname);
    }

    /** Whether the reviewer may review a page or file, asked once each this request. */
    const may = reviewer(account, context);

    const record = (action: string, detail: Record<string, unknown>) => audit(context.env, {
      actor: account,
      action: `submissions:submission:${action}`,
      target: `submission:${number}`,
      detail: { repo: setup.repo, vault: context.vault.id, ...detail },
    });

    return {
      account, number, mirror, may, field, typed, back, limited, heading, record,
      /** GitHub's pull request now and what it changes, for a reviewer who must be able to review all of it. */
      checked: () => checked(number, mirror, may, context),
    };
  }

  type Posted = Awaited<ReturnType<typeof posted>>;

  /**
   * Keep what the site posted for the account, so the panels show it as theirs before GitHub's delivery arrives. GitHub
   * took the post already, so a failure here is logged, not answered: the delivery still fills the mirror, and only the
   * account's name on that one post is lost.
   */
  async function keep({ mirror, number }: Posted, statements: Statement[]): Promise<void> {
    try {
      await mirror.db.batch(statements);
    } catch (error) {
      console.error(`[submissions] posted on pull request #${number} but couldn't record it as the account's: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Keep a comment the site posted for the account; answers its id on GitHub. */
  async function remember(form: Posted, made: unknown, kind: "issue" | "review", heading: string, text: string) {
    const { mirror, account, number } = form;
    const record = commentRecord(made, kind, number);
    if (!record) return undefined;
    await keep(form, [
      writeComment(mirror, record),
      mirror.db.prepare(`INSERT OR IGNORE INTO submissions_replies (scope, kind, id, account, name, role, header, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(mirror.scope, kind, record.id, account.id, account.name, account.roles[0] ?? "reviewer", heading, text),
    ]);
    return record.id;
  }

  /** `POST review/comment/`: a comment on the conversation, or with `thread`, a reply in that diff thread. */
  async function commentRoute(request: Request, context: ServerContext): Promise<Response> {
    const form = await posted(request, context);
    const { number, mirror, field, typed, back } = form;
    const thread = field("thread");
    if (thread !== "" && !POSITIVE.test(thread)) throw new SubmissionError("invalid_request", 400, "Your comment didn't arrive intact. Reload the page and try again.");
    const replyTo = thread === "" ? undefined : Number(thread);
    const anchor = replyTo === undefined ? "svartz-reply" : `svartz-reply-${replyTo}`;
    const answer = (status: string, extra: Record<string, string> = {}, at = anchor) =>
      back({ status, ...(replyTo === undefined ? {} : { thread: String(replyTo) }), ...extra }, at);

    if (!typed) return answer("empty");
    if (typed.length > MAX_REPLY_LENGTH) return answer("too-long");
    let threadPath: string | null = null;
    if (replyTo !== undefined) {
      // Replies go only to the first comment of a thread on this pull request, as GitHub takes them.
      const { results: [root] } = await mirror.db.prepare(`SELECT path FROM submissions_comments
        WHERE scope = ? AND kind = 'review' AND id = ? AND pull_number = ? AND in_reply_to IS NULL AND deleted = 0`)
        .bind(mirror.scope, replyTo, number).all<{ path: string | null }>();
      if (!root) return answer("thread-gone");
      threadPath = root.path;
    }
    const limit = await form.limited("status", replyTo === undefined ? {} : { thread: String(replyTo) }, anchor);
    if (limit) return limit;
    try {
      const inspected = await form.checked();
      // A thread can sit on a file the pull request no longer changes.
      if (threadPath !== null && !await form.may.path(threadPath)) throw new SubmissionError("not_allowed", 403, "You can't review the file this thread is on.");
      await form.record("comment", replyTo === undefined ? {} : { thread: replyTo });
      const heading = form.heading();
      const text = postedText(typed);
      const made = await postComment(inspected.github, number, attributed(heading, text), replyTo);
      const id = await remember(form, made, replyTo === undefined ? "issue" : "review", heading, text);
      return answer("sent", {}, id === undefined ? anchor : `comment-${id}`);
    } catch (error) {
      if (!(error instanceof SubmissionError) || error.status === 403 || error.code === "not_found") throw error;
      console.error(`[submissions] couldn't post a review comment on pull request #${number}`, error.message);
      return answer(error.code === "thread_gone" ? "thread-gone" : "github");
    }
  }

  /** The head a decision was made on, checked against GitHub's: a pull request that moved since is refused, not acted on blind. */
  function current(form: Posted, inspected: Inspected): string | undefined {
    if (!inspected.pull.open) return "closed";
    return form.field("head") === inspected.pull.headSha ? undefined : "head-moved";
  }

  /** `POST review/line/`: a comment on one line of one file's diff, at the head the reviewer looked at. */
  async function lineRoute(request: Request, context: ServerContext): Promise<Response> {
    const form = await posted(request, context);
    const { number, field, typed, back } = form;
    const [head, path, at, index] = [field("head"), field("file"), LINE.exec(field("at")), field("index")];
    if (!SHA.test(head) || !path || !at || !/^(?:0|[1-9]\d{0,5})$/.test(index)) {
      throw new SubmissionError("invalid_request", 400, "Your comment didn't arrive intact. Reload the page and try again.");
    }
    const answer = (review: string, extra: Record<string, string> = {}) => back({ review, file: index, ...extra }, `svartz-file-${index}`);
    if (!typed) return answer("empty-comment");
    if (typed.length > MAX_REPLY_LENGTH) return answer("too-long");
    const limit = await form.limited("review", { file: index }, `svartz-file-${index}`);
    if (limit) return limit;
    try {
      const inspected = await form.checked();
      const stale = current(form, inspected);
      if (stale) return answer(stale);
      if (!inspected.files.some(({ file }) => file.path === path)) return answer("line-gone");
      const side = at[1] === "LEFT" ? "LEFT" : "RIGHT";
      const line = Number(at[2]);
      await form.record("comment", { head, path, line, side });
      const heading = form.heading();
      const text = postedText(typed);
      const made = await postLineComment(inspected.github, number, { body: attributed(heading, text), head, path, line, side });
      await remember(form, made, "review", heading, text);
      return answer("commented");
    } catch (error) {
      if (!(error instanceof SubmissionError) || error.status === 403 || error.code === "not_found") throw error;
      console.error(`[submissions] couldn't post a line comment on pull request #${number}`, error.message);
      return answer(error.code === "line_gone" ? "line-gone" : "github");
    }
  }

  /** Each verdict a reviewer gives: GitHub's event, the mirror's state, the audit's action, and what the site answers and says. */
  const VERDICTS = {
    approve: { event: "APPROVE", state: "approved", action: "approve", done: "approved", fallback: "approved-as-comment", said: "Approved." },
    "request-changes": {
      event: "REQUEST_CHANGES", state: "changes_requested", action: "request-changes", done: "changes-requested", fallback: "requested-as-comment", said: "Changes requested.",
    },
  } as const satisfies Record<string, { event: ReviewEvent; state: ReviewVerdict; action: string; done: string; fallback: string; said: string }>;
  const isVerdict = (event: string): event is keyof typeof VERDICTS => Object.hasOwn(VERDICTS, event);

  /** `POST review/verdict/`: approve, or request changes, at the head the reviewer looked at. */
  async function verdictRoute(request: Request, context: ServerContext): Promise<Response> {
    const form = await posted(request, context);
    const { number, mirror, account, field, typed, back } = form;
    const event = field("event");
    if (!isVerdict(event) || !SHA.test(field("head"))) throw new SubmissionError("invalid_request", 400, "Your review didn't arrive intact. Reload the page and try again.");
    const verdict = VERDICTS[event];
    const answer = (review: string, extra: Record<string, string> = {}) => back({ review, ...extra }, "svartz-review");
    // GitHub takes no request for changes that doesn't say what to change.
    if (!typed && verdict.event === "REQUEST_CHANGES") return answer("empty");
    if (typed.length > MAX_REPLY_LENGTH) return answer("too-long");
    const limit = await form.limited("review", {}, "svartz-review");
    if (limit) return limit;
    try {
      const inspected = await form.checked();
      const stale = current(form, inspected);
      if (stale) return answer(stale);
      const head = inspected.pull.headSha;
      await form.record(verdict.action, { head });
      const heading = form.heading();
      let text = typed ? postedText(typed) : "";
      let made: unknown;
      let done: string = verdict.done;
      try {
        made = await submitReview(inspected.github, number, { event: verdict.event, body: text ? attributed(heading, text) : heading, head });
      } catch (error) {
        if (!(error instanceof SubmissionError) || error.code !== "own_pull_request") throw error;
        // The site opened it, so GitHub takes the verdict only as a comment, which says it under the header.
        text = text ? `${verdict.said}\n\n${text}` : verdict.said;
        made = await submitReview(inspected.github, number, { event: "COMMENT", body: attributed(heading, text), head });
        done = verdict.fallback;
      }
      const record = reviewRecord(made, number);
      // The verdict is the site's to record: on a pull request it opened, GitHub holds it only as a comment.
      if (record) {
        await keep(form, [
          writeReview(mirror, record),
          mirror.db.prepare(`INSERT OR IGNORE INTO submissions_posted_reviews (scope, id, account, name, role, header, body, verdict)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(mirror.scope, record.id, account.id, account.name, account.roles[0] ?? "reviewer", heading, text, verdict.state),
        ]);
      }
      return answer(done);
    } catch (error) {
      if (!(error instanceof SubmissionError) || error.status === 403 || error.code === "not_found") throw error;
      console.error(`[submissions] couldn't review pull request #${number}`, error.message);
      return answer("github");
    }
  }

  /** `POST review/merge/`: merge at the head the reviewer looked at, by a merge commit, or squashed where only that is allowed. */
  async function mergeRoute(request: Request, context: ServerContext): Promise<Response> {
    const form = await posted(request, context);
    const { number, field, back, account } = form;
    if (!SHA.test(field("head"))) throw new SubmissionError("invalid_request", 400, "Your merge didn't arrive intact. Reload the page and try again.");
    const answer = (review: string) => back({ review }, "svartz-review");
    const limit = await form.limited("review", {}, "svartz-review");
    if (limit) return limit;
    try {
      const inspected = await form.checked();
      const stale = current(form, inspected);
      if (stale) return answer(stale);
      const method = await mergeMethod(inspected.github);
      if (!method) return answer("no-merge-method");
      const head = inspected.pull.headSha;
      await form.record("merge", { head, method });
      await mergePull(inspected.github, number, {
        head,
        method,
        title: inspected.pull.title,
        by: { accountId: account.id, name: account.name, handle: account.handle, host: new URL(request.url).hostname },
      });
      return answer("merged");
    } catch (error) {
      if (!(error instanceof SubmissionError) || error.status === 403 || error.code === "not_found") throw error;
      if (error.code === "head_moved") return answer("head-moved");
      if (error.code === "not_mergeable") return answer("not-mergeable");
      console.error(`[submissions] couldn't merge pull request #${number}`, error.message);
      return answer("github");
    }
  }

  return {
    panel,
    authorize,
    routes: [
      ["/review/comment/", { method: "POST", run: commentRoute }],
      ["/review/line/", { method: "POST", run: lineRoute }],
      ["/review/verdict/", { method: "POST", run: verdictRoute }],
      ["/review/merge/", { method: "POST", run: mergeRoute }],
    ] as const,
  };
}

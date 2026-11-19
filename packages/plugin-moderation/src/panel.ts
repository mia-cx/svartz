/**
 * The Reports panel, at `/-/dashboard/moderation/reports/`: the vault's open reports, oldest first, each with what it's
 * about and the reader's reason, or with `?view=closed` the closed ones. Plain HTML forms post to this plugin's routes
 * to resolve or dismiss a report, and to the owning plugin's own routes to act on what was reported: annotations' to
 * hide a comment, submissions' to close a submission. Each action shows only to a viewer holding the owning plugin's
 * permission, which its route checks again. A report about an account, a comment one wrote, or an edit one saved (a
 * direct commit or a submission, as submissions' records name who saved it) links viewers holding
 * `moderation:accounts:write` to the Suspensions panel's form for that account. With history on the vault, a report
 * about a commit links viewers holding `history:reverts:write` on a page it changed to that page's diff for the
 * commit, where history's Revert form is. Reporters are never shown.
 *
 * A view reads what its reports are about in a fixed number of D1 calls, however many it lists: a free Worker gets 50
 * a request, and `tests/panel-cost.test.ts` counts them.
 */
import {
  ACCOUNTS_DATABASE_ENV, can, canEach, findProfiles, findProfilesByHandle, findProfilesByIdentity, readAccount, userPageLocation,
  type Account, type PublicProfile,
} from "@svartz/auth/server";
import { reputationBadgeHtml } from "@svartz/auth/badge";
import type { DashboardPanel, PageContext, PluginPage } from "@svartz/core";
import { findComments, type ReportedComment } from "@svartz/plugin-annotations/server";
import { changedFiles, savedEdits, type SavedEdits } from "@svartz/plugin-submissions/server";
import { escape } from "./html";
import { panelPath, vaultPath } from "./paths";
import { READ_REPORTS, WRITE_ACCOUNTS } from "./permissions";
import { listReports, migrate, type Database, type Report } from "./store";
import { suspensionPath } from "./suspensions";
import { publishedPage, type BuildData } from "./targets";

/** The panel's id below the plugin's, so it lives at `/-/dashboard/moderation/reports/`. */
export const PANEL = "reports";
const TITLE = "Reports";
/** Reports one view lists; the count above it says how many there are in all. */
const SHOWN = 100;

/** The owning plugins' permissions to act on what was reported. */
const HIDE_COMMENTS = "annotations:comments:delete";
const CLOSE_SUBMISSIONS = "submissions:reviews:write";
const REVERT_PAGES = "history:reverts:write";

/** What a form's `status` tells the moderator after it redirects back here. A Map: `status` comes from the URL. */
const STATUSES: ReadonlyMap<string, { text: string; error?: true }> = new Map([
  ["resolved", { text: "Report resolved." }],
  ["dismissed", { text: "Report dismissed." }],
  ["already-closed", { text: "Another moderator closed this report first.", error: true }],
  ["hidden", { text: "Comment hidden." }],
  ["submission-closed", { text: "Submission closed." }],
]);

/** The panel's path, which every form here goes back to. */
export const reportsPath = (context: Pick<PageContext, "base">) => panelPath(context, PANEL);

const KIND_LABELS = { page: "Page", commit: "Commit", submission: "Submission", annotation: "Comment", account: "Account" } as const;

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const time = (iso: string) => `<time datetime="${escape(iso)}">${escape(DATE.format(new Date(iso)))}</time>`;

/** A form that posts `fields` to `action` with one button. */
function button(action: string, fields: Record<string, string>, label: string, describedBy: string, primary = false): string {
  const inputs = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value)}">`).join("");
  return `<form method="post" action="${escape(action)}">${inputs}<button class="sv-account-button" type="submit"${primary ? " data-primary" : ""} aria-describedby="${describedBy}">${label}</button></form>`;
}

/** Everything the panel says about one report's target, and what the viewer may do to it. */
interface Shown {
  /** What it is, linked when the site shows it. */
  readonly what: string;
  /** The reported text itself, for a comment. */
  readonly quote?: string;
  /** Forms acting on the target through its owning plugin. */
  readonly actions: readonly string[];
}

/** A report the panel couldn't look up: it still lists, so it can be resolved or dismissed. */
const UNDESCRIBED: Shown = { what: `<span class="sv-account-muted">Couldn't show what this report is about.</span>`, actions: [] };

/**
 * What the panel knows of its reports' targets, read for the whole view at once. A source it couldn't read leaves only
 * the reports that need it undescribed (`undefined` here), or without the actions it would have offered.
 */
interface Known {
  /** Reported accounts, by the handle the report stored. */
  readonly accounts: ReadonlyMap<string, PublicProfile> | undefined;
  /** Reported comments, by id. */
  readonly comments: ReadonlyMap<string, ReportedComment> | undefined;
  /** The open comments the viewer may hide. */
  readonly hides: ReadonlySet<string>;
  /** The accounts behind open comments, by their author's sign-in; read only for a viewer who may suspend. */
  readonly authors: ReadonlyMap<string, PublicProfile>;
  /** Which reported commits and submissions the site saved for this vault, and the account behind each. */
  readonly edits: SavedEdits;
  /** The accounts behind those edits, by id; read only for a viewer who may suspend. */
  readonly editors: ReadonlyMap<string, PublicProfile>;
  /** For each open reported commit, the slugs of the published pages it changed that the viewer may revert. */
  readonly reverts: ReadonlyMap<string, readonly string[]>;
  readonly suspends: boolean;
  readonly closes: boolean;
}

const unique = <T>(values: readonly T[]) => [...new Set(values)];
const NO_EDITS: SavedEdits = { commits: new Map(), pulls: new Map() };
const NO_PROFILES: ReadonlyMap<string, PublicProfile> = new Map();
const NO_FILES: ReadonlyMap<string, readonly string[]> = new Map();

/** What `read` answers, or `fallback` when it fails, logged as `source`. */
async function settle<T, F>(source: string, read: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await read;
  } catch (cause) {
    console.error(`[svartz:moderation] couldn't read ${source} for the Reports panel`, cause);
    return fallback;
  }
}

/**
 * Everything `reports` need from auth, annotations and submissions, in two rounds of lookups that each take a list:
 * a fixed number of D1 calls, however many reports there are. Actions are looked up for open reports only.
 */
async function lookUp(context: PageContext, data: BuildData, viewer: Account | null, reports: readonly Report[]): Promise<Known> {
  const { env } = context;
  const vault = context.vault.id;
  const open = reports.filter((report) => report.state === "open");
  const ids = (kind: Report["target"]["kind"], among = reports) => unique(among.filter(({ target }) => target.kind === kind).map(({ target }) => target.id));
  const commentsDatabase = data.annotations?.database;
  const submissions = data.submissions;
  const asked = { commits: ids("commit", open), pulls: ids("submission", open).map(Number) };
  const records = submissions?.records && { ...submissions.records, repo: submissions.repo };
  const [accounts, comments, edits, suspends, closes, changed] = await Promise.all([
    settle("accounts", findProfilesByHandle(ids("account"), env), undefined),
    commentsDatabase === undefined ? new Map<string, ReportedComment>() : settle("comments", findComments(env, commentsDatabase, vault, ids("annotation")), undefined),
    records === undefined ? NO_EDITS : settle("edits", savedEdits(env, records, asked), NO_EDITS),
    open.length > 0 && settle("who may suspend", can(viewer, WRITE_ACCOUNTS, { vault }, env), false),
    asked.pulls.length > 0 && submissions !== undefined && settle("who may close", can(viewer, CLOSE_SUBMISSIONS, { vault }, env), false),
    // History reverts a page from its diff for a commit, so only the pages a commit changed that history shows count.
    records === undefined || !data.history || asked.commits.length === 0 ? NO_FILES : settle("commits' pages", changedFiles(env, records, asked.commits), NO_FILES),
  ]);
  const paths = data.history?.paths ?? {};
  const pagesOf = (sha: string) => unique((changed.get(sha) ?? []).flatMap((path) => (Object.hasOwn(paths, path) ? [paths[path]!] : [])));
  const revertible = unique(asked.commits.flatMap(pagesOf));

  const openComments = ids("annotation", open).flatMap((id) => comments?.get(id) ?? []);
  // Every listed comment's author shows with its reputation, a closed report's too.
  const commentAuthors = unique(ids("annotation").flatMap((id) => comments?.get(id)?.author.id ?? []));
  // Annotations hides a comment only when it keeps them in the accounts database, beside the audit log.
  const hideable = commentsDatabase === ACCOUNTS_DATABASE_ENV ? openComments.filter((comment) => !comment.hidden) : [];
  const editAccounts = unique([...edits.commits.values(), ...edits.pulls.values()].flatMap((account) => account ?? []));
  const [hiding, authors, editors, reverting] = await Promise.all([
    hideable.length === 0 ? [] : settle("who may hide", canEach(viewer, HIDE_COMMENTS, hideable.map(({ page }) => ({ vault, page })), env), []),
    // Comments name their author by sign-in; the account it's linked to carries the reputation, and is the one to suspend.
    commentAuthors.length === 0 ? NO_PROFILES : settle("comments' authors", findProfilesByIdentity(commentAuthors, env), NO_PROFILES),
    suspends ? settle("edits' accounts", findProfiles(editAccounts, env), NO_PROFILES) : NO_PROFILES,
    revertible.length === 0 ? [] : settle("who may revert", canEach(viewer, REVERT_PAGES, revertible.map((page) => ({ vault, page })), env), []),
  ]);
  const hides = new Set(hideable.filter((_, index) => hiding[index]).map(({ id }) => id));
  const mayRevert = new Set(revertible.filter((_, index) => reverting[index]));
  const reverts = new Map(asked.commits.map((sha) => [sha, pagesOf(sha).filter((slug) => mayRevert.has(slug))]));
  return { accounts, comments, hides, authors, edits, editors, reverts, suspends, closes };
}

/** Says what each report is about, with what this vault knows of it now, and offers the owning plugins' actions. */
function describer(context: PageContext, data: BuildData, known: Known) {
  const vault = context.vault.id;
  const root = vaultPath(context);
  // Page URLs from the build are below the deployment base.
  const site = root.slice(0, root.length - context.vault.mountPath.length);
  const pageLink = (slug: string) => {
    const page = publishedPage(data, slug);
    return page ? `<a href="${escape(`${site}${page.href}`)}">${escape(page.title)}</a>` : `${escape(slug)} <span class="sv-account-muted">(no longer on the site)</span>`;
  };
  /** A link to the form that suspends `profile`'s account, coming back to this report; offered only to who may suspend. */
  const suspendLink = (profile: PublicProfile | undefined, reportId: string, describedBy: string) => known.suspends && profile
    ? [`<a class="sv-account-button" href="${escape(suspensionPath(context, profile.handle, `${reportsPath(context)}#report-${reportId}`))}" aria-describedby="${describedBy}">Suspend @${escape(profile.handle)}</a>`]
    : [];
  /** The account the site's records say saved an edit, never what the commit itself claims. */
  const editor = (account: string | null | undefined) => account ? known.editors.get(account) : undefined;

  return (report: Report, describedBy: string): Shown => {
    const { kind, id } = report.target;
    const back = (status: string) => `${reportsPath(context)}?status=${status}#report-${report.id}`;
    const open = report.state === "open";
    switch (kind) {
      case "page":
        return { what: pageLink(id), actions: [] };
      case "account": {
        if (!known.accounts) return UNDESCRIBED;
        const profile = known.accounts.get(id);
        if (!profile) return { what: `@${escape(id)} <span class="sv-account-muted">(no account has this handle now)</span>`, actions: [] };
        // Auth says where user pages live; a page at that path in another vault is an ordinary page.
        const userPages = userPageLocation();
        const userPage = userPages.vault === vault ? publishedPage(data, `${userPages.folder}/${profile.handle}`) : undefined;
        const handle = userPage ? `<a href="${escape(`${site}${userPage.href}`)}">@${escape(profile.handle)}</a>` : `@${escape(profile.handle)}`;
        const actions = open ? suspendLink(profile, report.id, describedBy) : [];
        return { what: `${handle} ${reputationBadgeHtml(profile.reputation)} <span class="sv-account-muted">${escape(profile.name)}</span>`, actions };
      }
      case "annotation": {
        if (!known.comments) return UNDESCRIBED;
        const comment = known.comments.get(id);
        if (!comment) return { what: data.annotations === undefined ? "A comment" : "A comment that has since been deleted", actions: [] };
        const account = known.authors.get(comment.author.id);
        const badge = account ? ` ${reputationBadgeHtml(account.reputation)}` : "";
        const what = `${escape(comment.author.name)}${badge} on ${pageLink(comment.page)}${comment.hidden ? ' <span class="sv-account-tag">Hidden</span>' : ""}`;
        const actions = open && known.hides.has(id)
          ? [button(`${root}/_svartz/annotations/${encodeURIComponent(id)}/hide/`, { returnTo: back("hidden") }, "Hide comment", describedBy)]
          : [];
        if (open) actions.push(...suspendLink(account, report.id, describedBy));
        // A page that's since gone unpublished or protected takes its comments out of sight, here too.
        return { what, ...publishedPage(data, comment.page) && { quote: comment.body }, actions };
      }
      case "submission": {
        const submissions = data.submissions;
        const what = submissions
          ? `<a href="${escape(`https://github.com/${submissions.repo}/pull/${id}`)}">Pull request #${escape(id)}</a>`
          : `Pull request #${escape(id)}`;
        // Submissions closes only the vault's own pull requests, the saves its records hold, so Close shows only for those.
        const number = Number(id);
        const actions = open && known.closes && known.edits.pulls.has(number)
          ? [button(`${root}/_svartz/submissions/close/`, { number: id, returnTo: back("submission-closed") }, "Close submission", describedBy)]
          : [];
        if (open) actions.push(...suspendLink(editor(known.edits.pulls.get(number)), report.id, describedBy));
        return { what, actions };
      }
      case "commit": {
        // Each page the commit changed that the viewer may revert: its diff for the commit, where history's form is.
        const pages = open ? (known.reverts.get(id) ?? []).flatMap((slug) => publishedPage(data, slug) ?? []) : [];
        const reverts = pages.map(({ title, href }) => {
          const diff = `${root}/-/history${href.slice(context.vault.mountPath.length)}?to=${id}#sv-history-revert`;
          return `<a class="sv-account-button" href="${escape(diff)}" aria-describedby="${describedBy}">${pages.length > 1 ? `Revert ${escape(title)}` : "Revert"}</a>`;
        });
        return {
          what: data.submissions
            ? `<a href="${escape(`https://github.com/${data.submissions.repo}/commit/${id}`)}">Commit <code>${escape(id.slice(0, 7))}</code></a>`
            : `Commit <code>${escape(id.slice(0, 7))}</code>`,
          actions: open ? [...reverts, ...suspendLink(editor(known.edits.commits.get(id)), report.id, describedBy)] : [],
        };
      }
    }
  };
}

/** One report: what it's about, the reason, and the actions, or who closed it. */
function reportItem(report: Report, shown: Shown, context: PageContext): string {
  const id = `report-${report.id}`;
  const base = `${context.base}/reports/${encodeURIComponent(report.id)}`;
  const closed = report.state === "open" ? "" : `<p class="sv-account-muted">${report.state === "resolved" ? "Resolved" : "Dismissed"}${report.closedBy ? ` by @${escape(report.closedBy)}` : ""}${report.closedAt ? `, ${time(report.closedAt)}` : ""}</p>`;
  const actions = report.state !== "open" ? "" : `<div class="sv-moderation-actions">${[
    ...shown.actions,
    button(`${base}/resolve/`, {}, "Resolve", `${id}-target`, true),
    button(`${base}/dismiss/`, {}, "Dismiss", `${id}-target`),
  ].join("")}</div>`;
  return `<li class="sv-moderation-report" id="${id}">
<p class="sv-moderation-meta"><span class="sv-moderation-kind">${KIND_LABELS[report.target.kind]}</span> <span class="sv-account-muted">reported ${time(report.createdAt)}</span></p>
<p class="sv-moderation-target" id="${id}-target">${shown.what}</p>
${shown.quote === undefined ? "" : `<blockquote class="sv-moderation-quote">${escape(shown.quote)}</blockquote>`}
<div class="sv-moderation-reason"><p class="sv-account-muted">Reason</p><p>${escape(report.reason)}</p></div>
${closed}${actions}
</li>`;
}

/** The panel's page: the view's tabs, the last form's message, and its reports. */
async function reportsPage(request: Request, context: PageContext, data: BuildData, db: Database): Promise<PluginPage> {
  const query = new URL(request.url).searchParams;
  const open = query.get("view") !== "closed";
  const viewer = await readAccount(request, context.env);
  const listed = await listReports(db, context.vault.id, open, SHOWN);
  const describe = describer(context, data, await lookUp(context, data, viewer, listed.reports));
  const items = listed.reports.map((report) => reportItem(report, describe(report, `report-${report.id}-target`), context));
  const status = STATUSES.get(query.get("status") ?? "");
  const message = status
    ? `<p class="sv-account-status" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(status.text)}</p>`
    : "";
  const here = reportsPath(context);
  const tab = (label: string, count: number, href: string, current: boolean) =>
    `<li><a href="${escape(href)}"${current ? ' aria-current="page"' : ""}>${label} <span class="sv-moderation-count">${count}</span></a></li>`;
  const empty = open ? "No open reports." : "No closed reports yet.";
  return {
    title: TITLE,
    html: `<div class="sv-account sv-dashboard sv-moderation">
<h1>${TITLE}</h1>
<nav class="sv-moderation-views" aria-label="Reports"><ul>${tab("Open", listed.open, here, open)}${tab("Closed", listed.closed, `${here}?view=closed`, !open)}</ul></nav>
${message}
${items.length ? `<ol class="sv-moderation-reports">${items.join("\n")}</ol>` : `<p class="sv-account-muted">${empty}</p>`}
</div>`,
  };
}

/** The Reports panel, which the dashboard shows to viewers holding `moderation:reports:read` on the vault. */
export function reportsPanel(data: BuildData): DashboardPanel {
  return {
    id: PANEL,
    title: TITLE,
    permission: READ_REPORTS,
    async render(request, context) {
      if (context.path !== "") return undefined;
      // The viewer holds a permission, so has an account, so the accounts database is bound.
      const db = context.env[ACCOUNTS_DATABASE_ENV] as Database;
      await migrate(db);
      return reportsPage(request, context, data, db);
    },
  };
}

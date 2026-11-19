/**
 * The Reports panel, at `/-/dashboard/moderation/reports/`: the vault's open reports, oldest first, each with what it's
 * about and the reader's reason, or with `?view=closed` the closed ones. Plain HTML forms post to this plugin's routes
 * to resolve or dismiss a report, and to the owning plugin's own routes to act on what was reported: annotations' to
 * hide a comment, submissions' to close a submission. Each action shows only to a viewer holding the owning plugin's
 * permission, which its route checks again. Reporters are never shown.
 */
import { can, findProfile, readAccount, type Account } from "@svartz/auth/server";
import type { DashboardPanel, PageContext, PluginPage } from "@svartz/core";
import { findComment, type ReportedComment } from "@svartz/plugin-annotations/server";
import { PLUGIN_ID } from "./api";
import { escape } from "./html";
import { READ_REPORTS } from "./permissions";
import { listReports, migrate, type Database, type Report } from "./store";
import type { BuildData } from "./targets";

/** The panel's id below the plugin's, so it lives at `/-/dashboard/moderation/reports/`. */
export const PANEL = "reports";
const TITLE = "Reports";
/** Reports one view lists; the count above it says how many there are in all. */
const SHOWN = 100;

/** The owning plugins' permissions to act on what was reported. */
const HIDE_COMMENTS = "annotations:comments:delete";
const CLOSE_SUBMISSIONS = "submissions:reviews:write";

/** What a form's `status` tells the moderator after it redirects back here. */
const STATUSES: Readonly<Record<string, { text: string; error?: true }>> = {
  resolved: { text: "Report resolved." },
  dismissed: { text: "Report dismissed." },
  "already-closed": { text: "Another moderator closed this report first.", error: true },
  hidden: { text: "Comment hidden." },
  "submission-closed": { text: "Submission closed." },
};

/** `<base><mount>` from a context of this plugin. */
const vaultPath = (context: Pick<PageContext, "base">) => context.base.slice(0, -`/_svartz/${PLUGIN_ID}`.length);

/** The panel's path, which every form here goes back to. */
export const panelPath = (context: Pick<PageContext, "base">) => `${vaultPath(context)}/-/dashboard/${PLUGIN_ID}/${PANEL}/`;

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

/** Says what each report is about, with what this vault knows of it now, and offers the owning plugins' actions. */
function describer(context: PageContext, data: BuildData, viewer: Account | null) {
  const vault = context.vault.id;
  const root = vaultPath(context);
  // Page URLs from the build are below the deployment base.
  const site = root.slice(0, root.length - context.vault.mountPath.length);
  const pageLink = (slug: string) => {
    const page = data.pages[slug];
    return page ? `<a href="${escape(`${site}${page.href}`)}">${escape(page.title)}</a>` : `${escape(slug)} <span class="sv-account-muted">(no longer on the site)</span>`;
  };
  // Asked once, and only when a submission report needs it.
  let closes: Promise<boolean> | undefined;
  const closesSubmissions = () => closes ??= data.submissions ? can(viewer, CLOSE_SUBMISSIONS, { vault }, context.env) : Promise.resolve(false);

  return async (report: Report, describedBy: string): Promise<Shown> => {
    const { kind, id } = report.target;
    const back = (status: string) => `${panelPath(context)}?status=${status}#report-${report.id}`;
    const open = report.state === "open";
    switch (kind) {
      case "page":
        return { what: pageLink(id), actions: [] };
      case "account": {
        const profile = await findProfile(id, context.env);
        if (!profile) return { what: `@${escape(id)} <span class="sv-account-muted">(no account has this handle now)</span>`, actions: [] };
        const userPage = data.pages[`${data.userPages}/${profile.handle}`];
        const handle = userPage ? `<a href="${escape(`${site}${userPage.href}`)}">@${escape(profile.handle)}</a>` : `@${escape(profile.handle)}`;
        return { what: `${handle} <span class="sv-account-muted">${escape(profile.name)}</span>`, actions: [] };
      }
      case "annotation": {
        const comment: ReportedComment | undefined = data.annotations && await findComment(context.env, data.annotations.database, vault, id);
        if (!comment) return { what: data.annotations ? "A comment that has since been deleted" : "A comment", actions: [] };
        const what = `${escape(comment.author.name)} on ${pageLink(comment.page)}${comment.hidden ? ' <span class="sv-account-tag">Hidden</span>' : ""}`;
        const hides = open && !comment.hidden && await can(viewer, HIDE_COMMENTS, { vault, page: comment.page }, context.env);
        const actions = hides ? [button(`${root}/_svartz/annotations/${encodeURIComponent(id)}/hide/`, { returnTo: back("hidden") }, "Hide comment", describedBy)] : [];
        return { what, quote: comment.body, actions };
      }
      case "submission": {
        const what = data.submissions
          ? `<a href="${escape(`https://github.com/${data.submissions.repo}/pull/${id}`)}">Pull request #${escape(id)}</a>`
          : `Pull request #${escape(id)}`;
        const actions = open && await closesSubmissions() ? [button(`${root}/_svartz/submissions/close/`, { number: id, returnTo: back("submission-closed") }, "Close submission", describedBy)] : [];
        return { what, actions };
      }
      case "commit":
        return {
          what: data.submissions
            ? `<a href="${escape(`https://github.com/${data.submissions.repo}/commit/${id}`)}">Commit <code>${escape(id.slice(0, 7))}</code></a>`
            : `Commit <code>${escape(id.slice(0, 7))}</code>`,
          actions: [],
        };
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
  const describe = describer(context, data, viewer);
  const items = await Promise.all(listed.reports.map(async (report) => reportItem(report, await describe(report, `report-${report.id}-target`), context)));
  const status = STATUSES[query.get("status") ?? ""];
  const message = status
    ? `<p class="sv-account-status" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(status.text)}</p>`
    : "";
  const here = panelPath(context);
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
export function reportsPanel(data: BuildData, database: string): DashboardPanel {
  return {
    id: PANEL,
    title: TITLE,
    permission: READ_REPORTS,
    async render(request, context) {
      if (context.path !== "") return undefined;
      const db = context.env[database] as Database | undefined;
      if (!db) return { title: TITLE, html: `<div class="sv-account sv-dashboard"><h1>${TITLE}</h1><p class="sv-account-status" role="alert" data-error>Bind a D1 database as ${escape(database)} to keep reports.</p></div>` };
      await migrate(db);
      return reportsPage(request, context, data, db);
    },
  };
}

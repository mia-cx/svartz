/**
 * The markup of the My submissions panel: the list of a reader's submissions, and one submission with its status,
 * reviews and comment threads, where reply forms post to the plugin's `reply/` route and come back with `?status=`.
 * Plain HTML in the theme's shell, styled as auth's dashboard panels (`.sv-account`, `.sv-dashboard`); it works before
 * any script loads, and the browser script adds the editor's button for a follow-up edit.
 *
 * Everything here comes from GitHub's users or the site's readers, so all of it is escaped, and comment text shows as
 * the plain text it was written in: its Markdown is never rendered.
 */
import type { PluginPage } from "@svartz/core";
import type { EditStage } from "./api";
import { MAX_REPLY_LENGTH } from "./attribution";

const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
/** A link GitHub gave us, kept only when it is one. */
const githubLink = (url: string) => (/^https:\/\/github\.com\//.test(url) ? url : undefined);
const dates = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const date = (iso: string) => `<time datetime="${escape(iso)}">${escape(dates.format(new Date(iso)))}</time>`;

/** A pull request's state as the list shows it: in review, or how review ended. */
export type ListedState = "open" | "merged" | "closed";
/** The latest review that decided something: GitHub's states, lowercase. */
export type ReviewVerdict = "approved" | "changes_requested";

/** One submission in the list. */
export interface ListedSubmission {
  readonly number: number;
  readonly title: string;
  /** `edit` of a published page, or a `new` page. */
  readonly kind: "edit" | "new";
  readonly state: ListedState;
  readonly verdict: ReviewVerdict | null;
  readonly comments: number;
  readonly savedAt: string;
  /** Its view on the panel. */
  readonly href: string;
}

export interface SubmissionList {
  readonly submissions: readonly ListedSubmission[];
  /** The panel's own path, which the page links add `?page=` to. */
  readonly here: string;
  readonly page: number;
  readonly more: boolean;
}

const STATE_LABELS: Readonly<Record<ListedState | ReviewVerdict, string>> = {
  open: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
  merged: "Merged",
  closed: "Closed",
};

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The list: open submissions first, then the rest, newest first, a page at a time. */
export function listPage({ submissions, here, page, more }: SubmissionList): PluginPage {
  const rows = submissions.map((submission) => {
    const state = submission.state === "open" && submission.verdict ? submission.verdict : submission.state;
    const meta = [
      submission.kind === "edit" ? "Edit" : "New page",
      `#${submission.number}`,
      `sent ${date(submission.savedAt)}`,
      ...(submission.comments > 0 ? [plural(submission.comments, "comment")] : []),
    ];
    return `<li class="sv-account-row">
  <div class="sv-account-what">
    <a class="sv-account-name" href="${escape(submission.href)}">${escape(submission.title)}</a>
    <span class="sv-account-muted">${meta.join(" · ")}</span>
  </div>
  <span class="svartz-submissions-state" data-state="${state}">${STATE_LABELS[state]}</span>
</li>`;
  });
  const pageLink = (to: number, label: string) => `<a href="${escape(to > 1 ? `${here}?page=${to}` : here)}">${label}</a>`;
  const pages = page > 1 || more
    ? `<nav class="sv-dashboard-crumbs" aria-label="More submissions">${page > 1 ? pageLink(page - 1, "Newer") : ""}${more ? pageLink(page + 1, "Older") : ""}</nav>`
    : "";
  const body = rows.length > 0
    ? `<ul class="sv-account-list">\n${rows.join("\n")}\n</ul>\n${pages}`
    : page > 1 ? `<p>There are no older submissions.</p>\n${pageLink(1, "Back to your latest")}` : "<p>Edits you send for review show up here.</p>";
  return { title: "My submissions", html: `<div class="sv-account sv-dashboard svartz-submissions-dashboard">\n<h1>My submissions</h1>\n${body}\n</div>` };
}

/** Who wrote something: a GitHub user by login, or an account the site posted for, by name and role. */
export type Author = { readonly login: string | null } | { readonly name: string; readonly role: string };

export interface Comment {
  readonly id: number;
  readonly author: Author;
  readonly body: string;
  readonly at: string;
  readonly url: string;
}

/** What the conversation holds, in time order. */
export type Entry =
  | { readonly kind: "review"; readonly author: Author; readonly state: string; readonly body: string; readonly at: string; readonly url: string }
  | { readonly kind: "comment"; readonly comment: Comment }
  /** A diff comment thread on `path`; `replyTo` is its first comment, which replies go to, while GitHub has it. */
  | { readonly kind: "thread"; readonly path: string | null; readonly line: number | null; readonly comments: readonly Comment[]; readonly replyTo?: number; readonly at: string };

export interface SubmissionView {
  readonly number: number;
  readonly title: string;
  readonly kind: "edit" | "new";
  readonly stage: EditStage;
  /** The pull request on GitHub. */
  readonly url: string;
  /** The edited page on the site, while it is published. */
  readonly pageUrl?: string;
  readonly entries: readonly Entry[];
  /** The list it belongs to. */
  readonly back: string;
  /** Where reply forms post; without it, the view takes no replies. */
  readonly replyAction?: string;
  /** The file a follow-up edit changes, inside the vault; the browser script offers the editor on it. */
  readonly followUp?: string;
  /** What the last reply came back with: `?status=` and the thread it was in. */
  readonly status?: { readonly code: string; readonly thread?: number; readonly retry?: number };
}

/** What the reader sees after a reply, by the `status` the `reply/` route answers with. */
const REPLY_STATUSES: Readonly<Record<string, { error: boolean; text: (retry?: number) => string }>> = {
  sent: { error: false, text: () => "Reply sent." },
  empty: { error: true, text: () => "Write a reply first." },
  "too-long": { error: true, text: () => `Shorten your reply to ${MAX_REPLY_LENGTH.toLocaleString("en")} characters or fewer.` },
  "rate-limited": { error: true, text: (retry) => `You've sent too many replies. Try again in ${Math.max(1, Math.ceil((retry ?? 60) / 60))} minutes.` },
  "thread-gone": { error: true, text: () => "That comment is gone on GitHub, so your reply wasn't sent." },
  github: { error: true, text: () => "GitHub didn't take your reply. Try again in a moment." },
};

/** What the page says of where the submission stands. */
const STAGE_TEXT: Readonly<Record<EditStage, string>> = {
  open: "Waiting for review.",
  closed: "Closed without merging.",
  committed: "Merged. It goes live once the site rebuilds.",
  building: "Merged. The site is rebuilding with it.",
  live: "Merged and live.",
  failed: "Merged, but the site's rebuild failed, so it isn't live yet.",
};

const REVIEW_TEXT: Readonly<Record<string, string>> = {
  approved: "approved",
  changes_requested: "requested changes",
  commented: "reviewed",
  dismissed: "reviewed (dismissed)",
};

function by(author: Author): string {
  if ("login" in author) return `<span class="sv-account-name">${escape(author.login ?? "A deleted GitHub user")}</span>`;
  return `<span class="sv-account-name">${escape(author.name)}</span> <span class="sv-account-tag">${escape(author.role)}</span>`;
}

function when(at: string, url: string): string {
  const link = githubLink(url);
  return link ? `<a class="sv-account-muted" href="${escape(link)}">${date(at)}</a>` : `<span class="sv-account-muted">${date(at)}</span>`;
}

const text = (body: string) => (body ? `<p class="svartz-submissions-text">${escape(body)}</p>` : "");

function commentHtml({ id, author, body, at, url }: Comment): string {
  return `<article class="svartz-submissions-comment" id="comment-${id}">
  <header>${by(author)} ${when(at, url)}</header>
  ${text(body)}
</article>`;
}

/** The status line for the form a reply came back to, if it came back to `thread` (`undefined`: the conversation). */
function replyStatus(view: SubmissionView, thread: number | undefined): string {
  const status = view.status && REPLY_STATUSES[view.status.code];
  if (!status || view.status!.thread !== thread) return "";
  return `<p class="sv-account-status" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(status.text(view.status!.retry))}</p>`;
}

/** A reply form: on the conversation, or in the thread `thread` starts. */
function replyForm(view: SubmissionView, thread?: number): string {
  const id = `svartz-reply-${thread ?? "conversation"}`;
  const failed = view.status !== undefined && view.status.thread === thread && REPLY_STATUSES[view.status.code]?.error;
  const fields = `<form class="sv-account-form" method="post" action="${escape(view.replyAction!)}" data-svartz-reply="${thread ?? "conversation"}">
  <input type="hidden" name="pull" value="${view.number}">${thread === undefined ? "" : `\n  <input type="hidden" name="thread" value="${thread}">`}
  <div class="sv-account-field svartz-submissions-reply">
    <label for="${id}">${thread === undefined ? "Reply" : "Your reply"}</label>
    <textarea class="sv-account-input" id="${id}" name="body" rows="4" required maxlength="${MAX_REPLY_LENGTH}"${failed ? ' aria-invalid="true"' : ""}></textarea>
  </div>
  <div><button type="submit" class="sv-account-button" data-primary>Send reply</button></div>
</form>`;
  if (thread === undefined) return `${replyStatus(view, thread)}${fields}`;
  // Closed until wanted, so a long thread list isn't a wall of text boxes; open again when its reply came back.
  return `<details class="svartz-submissions-thread-reply"${view.status?.thread === thread ? " open" : ""}>
  <summary>Reply</summary>
  ${replyStatus(view, thread)}${fields}
</details>`;
}

function entryHtml(entry: Entry, view: SubmissionView): string {
  if (entry.kind === "comment") return `<li>${commentHtml(entry.comment)}</li>`;
  if (entry.kind === "review") {
    return `<li><article class="svartz-submissions-comment" data-review="${escape(entry.state)}">
  <header>${by(entry.author)} ${escape(REVIEW_TEXT[entry.state] ?? "reviewed")} ${when(entry.at, entry.url)}</header>
  ${text(entry.body)}
</article></li>`;
  }
  const where = entry.path === null ? "On the changes" : `On <code>${escape(entry.path)}</code>${entry.line === null ? " (an earlier version)" : `, line ${entry.line}`}`;
  return `<li><section class="svartz-submissions-thread">
  <h3>${where}</h3>
  ${entry.comments.map(commentHtml).join("\n")}
  ${view.replyAction && entry.replyTo !== undefined ? replyForm(view, entry.replyTo) : ""}
</section></li>`;
}

/** One submission: where it stands, its conversation, and the forms that answer it. */
export function submissionPage(view: SubmissionView): PluginPage {
  const github = githubLink(view.url);
  const links = [
    ...(view.pageUrl ? [`<a href="${escape(view.pageUrl)}">Open the page</a>`] : []),
    ...(github ? [`<a href="${escape(github)}">Pull request #${view.number} on GitHub</a>`] : []),
  ];
  const followUp = view.followUp === undefined
    ? ""
    : `\n<div class="sv-account-page" data-svartz-region="follow-up-actions" data-svartz-follow-up="${view.number}" data-svartz-follow-up-path="${escape(view.followUp)}"></div>`;
  const conversation = view.entries.length > 0
    ? `<ol class="svartz-submissions-timeline">\n${view.entries.map((entry) => entryHtml(entry, view)).join("\n")}\n</ol>`
    : "<p class=\"sv-account-muted\">No reviews or comments yet.</p>";
  return {
    title: view.title,
    html: `<div class="sv-account sv-dashboard svartz-submissions-dashboard">
<nav class="sv-dashboard-crumbs" aria-label="Submissions"><a href="${escape(view.back)}">My submissions</a></nav>
<div>
<h1>${escape(view.title)}</h1>
<p class="sv-account-muted svartz-submissions-links">${view.kind === "edit" ? "Edit" : "New page"} · ${links.join(" · ")}</p>
</div>
<div class="sv-account-who">
<p class="sv-account-lead" data-stage="${view.stage}">${STAGE_TEXT[view.stage]}</p>${followUp}
</div>
<section aria-labelledby="svartz-conversation">
<h2 id="svartz-conversation">Conversation</h2>
${conversation}
</section>${view.replyAction ? `\n<div id="svartz-reply">\n${replyForm(view)}\n</div>` : ""}
</div>`,
  };
}

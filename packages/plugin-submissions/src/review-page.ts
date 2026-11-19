/**
 * The markup of the Submissions review panel: the list of open submissions, and, in a submission's view (the one My
 * submissions renders, from `submission-page.ts`), the changes a reviewer may review and the forms that answer them.
 * Plain HTML in the theme's shell, styled as auth's dashboard panels; every form posts to the plugin's `review/`
 * routes and comes back with `?status=`.
 *
 * Paths, titles and names come from GitHub or readers, so all of them are escaped; a rendered page arrives already
 * sanitized by `render.ts`.
 */
import { reputationBadgeHtml } from "@svartz/auth/badge";
import type { PluginPage } from "@svartz/core";
import { MAX_REPLY_LENGTH } from "./attribution";
import type { ListedState, ReviewVerdict } from "./submission-page";

const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const dates = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const date = (iso: string) => `<time datetime="${escape(iso)}">${escape(dates.format(new Date(iso)))}</time>`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Who sent a submission: the account the site saved it for, or its author on GitHub. */
export type Submitter =
  | { readonly kind: "account"; readonly name: string; readonly handle: string; readonly reputation: number }
  | { readonly kind: "github"; readonly login: string | null };

/** One open submission in the list. */
export interface ReviewRow {
  readonly number: number;
  /** The published page it edits, or the pull request's number when the site may not name what it changes. */
  readonly title: string;
  readonly kind?: "edit" | "new";
  readonly submitter: Submitter;
  readonly verdict: ReviewVerdict | null;
  readonly comments: number;
  readonly updatedAt: string;
  readonly href: string;
}

const VERDICT_LABELS: Readonly<Record<Extract<ListedState, "open"> | ReviewVerdict, string>> = {
  open: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

function submitter(who: Submitter): string {
  if (who.kind === "account") return `${escape(who.name)} ${reputationBadgeHtml(who.reputation)} @${escape(who.handle)}`;
  return who.login ? `${escape(who.login)} on GitHub` : "A deleted GitHub user";
}

/** The panel: open submissions, newest activity first, a page at a time. */
export function reviewListPage({ rows, here, page, more }: { rows: readonly ReviewRow[]; here: string; page: number; more: boolean }): PluginPage {
  const items = rows.map((row) => {
    const state = row.verdict ?? "open";
    const meta = [
      ...(row.kind ? [row.kind === "edit" ? "Edit" : "New page"] : []),
      `#${row.number}`,
      `by ${submitter(row.submitter)}`,
      `updated ${date(row.updatedAt)}`,
      ...(row.comments > 0 ? [plural(row.comments, "comment", "comments")] : []),
    ];
    return `<li class="sv-account-row">
  <div class="sv-account-what">
    <a class="sv-account-name" href="${escape(row.href)}">${escape(row.title)}</a>
    <span class="sv-account-muted">${meta.join(" · ")}</span>
  </div>
  <span class="svartz-submissions-state" data-state="${state}">${VERDICT_LABELS[state]}</span>
</li>`;
  });
  const pageLink = (to: number, label: string) => `<a href="${escape(to > 1 ? `${here}?page=${to}` : here)}">${label}</a>`;
  const pages = page > 1 || more
    ? `<nav class="sv-dashboard-crumbs" aria-label="More submissions">${page > 1 ? pageLink(page - 1, "Newer") : ""}${more ? pageLink(page + 1, "Older") : ""}</nav>`
    : "";
  const body = items.length > 0
    ? `<ul class="sv-account-list">\n${items.join("\n")}\n</ul>\n${pages}`
    : page > 1 ? `<p>There are no older submissions.</p>\n${pageLink(1, "Back to the latest")}` : "<p>No submissions are waiting for review.</p>";
  return { title: "Submissions", html: `<div class="sv-account sv-dashboard svartz-submissions-dashboard">\n<h1>Submissions</h1>\n${body}\n</div>` };
}

/** One line of a diff: unchanged, added or removed, with its number at the base and at the head. */
export interface DiffLine {
  readonly kind: "same" | "add" | "del";
  readonly text: string;
  readonly old?: number;
  readonly new?: number;
}

/** A changed file the reviewer may review. */
export interface ReviewedFile {
  /** Its repository path, which a line comment names. */
  readonly path: string;
  /** Its path in the vault, as the reader sees it, and before the change when the change moved it. */
  readonly shown: string;
  readonly previous?: string;
  readonly status: string;
  /** GitHub's diff, as hunks; `undefined` when GitHub shows none, as for an image or a very large change. */
  readonly hunks: ReadonlyArray<readonly DiffLine[]> | undefined;
  /** The page at an open submission's head, rendered and sanitized; absent for a file that isn't a page. */
  readonly preview?: string;
}

/** What a review form came back with: `?status=`, and the file a line comment was on. */
export interface ActionStatus {
  readonly code: string;
  readonly file?: number;
  readonly retry?: number;
}

const minutes = (retry = 60) => Math.max(1, Math.ceil(retry / 60));

/** What the reviewer reads after a review form, by the `status` its route answers with. */
const ACTION_STATUSES: Readonly<Record<string, { error: boolean; text: (retry?: number) => string }>> = {
  commented: { error: false, text: () => "Comment sent." },
  approved: { error: false, text: () => "Approved." },
  "changes-requested": { error: false, text: () => "Changes requested." },
  "approved-as-comment": { error: false, text: () => "Your approval is posted as a comment: GitHub doesn't let the site approve a pull request it opened." },
  "requested-as-comment": { error: false, text: () => "Your request is posted as a comment: GitHub doesn't let the site request changes on a pull request it opened." },
  merged: { error: false, text: () => "Merged." },
  empty: { error: true, text: () => "Write what needs to change first." },
  "empty-comment": { error: true, text: () => "Write a comment first." },
  "too-long": { error: true, text: () => `Shorten it to ${MAX_REPLY_LENGTH.toLocaleString("en")} characters or fewer.` },
  "line-gone": { error: true, text: () => "GitHub couldn't find that line in the changes. Reload the page and try again." },
  "head-moved": { error: true, text: () => "This submission changed since you opened it. Look over the changes below, then try again." },
  "not-mergeable": { error: true, text: () => "GitHub won't merge it yet. It may have conflicts or checks that haven't passed." },
  "no-merge-method": { error: true, text: () => "The repository only takes rebase merges, which the site doesn't make. Merge it on GitHub." },
  closed: { error: true, text: () => "This submission is closed." },
  "not-allowed": { error: true, text: () => "You can't review every file this submission changes." },
  "rate-limited": { error: true, text: (retry) => `You've sent too many reviews. Try again in ${plural(minutes(retry), "minute", "minutes")}.` },
  github: { error: true, text: () => "GitHub didn't take it. Try again in a moment." },
};

function statusLine(status: ActionStatus | undefined): string {
  // An own key only: a code such as `constructor` names nothing here.
  const known = status && Object.hasOwn(ACTION_STATUSES, status.code) ? ACTION_STATUSES[status.code] : undefined;
  if (!known) return "";
  return `<p class="sv-account-status" role="${known.error ? "alert" : "status"}"${known.error ? " data-error" : ""}>${escape(known.text(status!.retry))}</p>`;
}

const STATUS_WORDS: Readonly<Record<string, string>> = { added: "New page", removed: "Removed", renamed: "Moved", copied: "Copied" };

/** A diff row: its line numbers, its sign, its text, and with `pick`, the radio that picks it for a comment. */
function diffRow(line: DiffLine, pick: boolean): string {
  const sign = line.kind === "add"
    ? '<span aria-hidden="true">+</span><span class="svartz-submissions-hidden">Added</span>'
    : line.kind === "del" ? '<span aria-hidden="true">−</span><span class="svartz-submissions-hidden">Removed</span>' : "";
  const text = escape(line.text);
  const content = line.kind === "add" ? `<ins>${text}</ins>` : line.kind === "del" ? `<del>${text}</del>` : text;
  // A removed line is commented on as the base has it, any other as the head has it, as GitHub places comments.
  const at = line.kind === "del" ? `LEFT:${line.old}` : `RIGHT:${line.new}`;
  const label = line.kind === "del" ? `Comment on removed line ${line.old}` : `Comment on line ${line.new}`;
  const radio = pick ? `<td class="svartz-submissions-pick"><input type="radio" name="at" value="${at}" aria-label="${label}" required></td>` : "";
  return `<tr data-kind="${line.kind}">${radio}<td class="svartz-submissions-num">${line.old ?? ""}</td><td class="svartz-submissions-num">${line.new ?? ""}</td><td class="svartz-submissions-sign">${sign}</td><td class="svartz-submissions-line">${content}</td></tr>`;
}

/** Where line comments post, for a reviewer who may comment, with the head commit the diff shows. */
export interface LineComments {
  readonly action: string;
  readonly number: number;
  readonly head: string;
}

/** Whether `file` gets a form to comment on its lines. */
const commentable = (file: ReviewedFile | undefined, comments: LineComments | undefined): comments is LineComments =>
  comments !== undefined && file?.hunks !== undefined && file.hunks.length > 0;

function fileHtml(file: ReviewedFile, index: number, comments: LineComments | undefined, status: ActionStatus | undefined): string {
  const word = STATUS_WORDS[file.status];
  const moved = file.previous ? ` from <code>${escape(file.previous)}</code>` : "";
  const heading = `<h3><code>${escape(file.shown)}</code>${word ? ` <span class="sv-account-muted">${word}${moved}</span>` : ""}</h3>`;
  const pick = commentable(file, comments);
  const table = file.hunks === undefined
    ? "<p class=\"sv-account-muted\">GitHub shows no line changes for this file.</p>"
    : file.hunks.length === 0
      ? "<p class=\"sv-account-muted\">No lines changed.</p>"
      : `<table class="svartz-submissions-diff"><thead><tr>${pick ? '<th class="svartz-submissions-hidden">Comment</th>' : ""}<th class="svartz-submissions-hidden">Line before</th><th class="svartz-submissions-hidden">Line after</th><th class="svartz-submissions-hidden">Change</th><th class="svartz-submissions-hidden">Text</th></tr></thead>${
        file.hunks.map((hunk) => `<tbody>${hunk.map((line) => diffRow(line, pick)).join("")}</tbody>`).join("")}</table>`;
  const id = `svartz-line-comment-${index}`;
  const source = pick
    ? `<form class="sv-account-form svartz-submissions-line-form" method="post" action="${escape(comments.action)}">
  <input type="hidden" name="pull" value="${comments.number}">
  <input type="hidden" name="head" value="${escape(comments.head)}">
  <input type="hidden" name="file" value="${escape(file.path)}">
  <input type="hidden" name="index" value="${index}">
  ${table}
  ${status?.file === index ? statusLine(status) : ""}
  <div class="sv-account-field svartz-submissions-reply">
    <label for="${id}">Comment on the line you picked</label>
    <textarea class="sv-account-input" id="${id}" name="body" rows="3" required maxlength="${MAX_REPLY_LENGTH}"></textarea>
  </div>
  <div><button type="submit" class="sv-account-button">Comment on line</button></div>
</form>`
    : table;
  const preview = file.preview === undefined
    ? ""
    : `<details class="svartz-submissions-preview"${file.status === "added" ? " open" : ""}>
  <summary>Preview</summary>
  <div class="sv-prose svartz-submissions-rendered">${file.preview}</div>
</details>`;
  return `<article class="svartz-submissions-file" id="svartz-file-${index}">
${heading}
${source}
${preview}
</article>`;
}

/** The changes section of a submission's view: the files the reviewer may review, and a count of the rest. */
export function changesSection({ files, hidden, complete, unavailable, comments, status }: {
  readonly files: readonly ReviewedFile[];
  /** Files the reviewer may not review: counted, never named. */
  readonly hidden: number;
  /** Whether GitHub listed every file. */
  readonly complete: boolean;
  /** GitHub couldn't be asked for the changes. */
  readonly unavailable: boolean;
  readonly comments: LineComments | undefined;
  readonly status: ActionStatus | undefined;
}): string {
  // A line comment's answer shows by its file's form; once that form is gone, as when the submission closed, here.
  const loose = status?.file !== undefined && !commentable(files[status.file], comments) ? statusLine(status) : "";
  const body = unavailable
    ? "<p>GitHub isn't answering right now, so the changes can't be shown. Try again in a few minutes.</p>"
    : [
      ...files.map((file, index) => fileHtml(file, index, comments, status)),
      ...(hidden > 0 ? [`<p class="sv-account-muted">${plural(hidden, "file you can't review", "files you can't review")}</p>`] : []),
      ...(complete ? [] : ["<p class=\"sv-account-muted\">GitHub lists only part of these changes.</p>"]),
    ].join("\n");
  return `<section class="svartz-submissions-changes" aria-labelledby="svartz-changes">
<h2 id="svartz-changes">Changes</h2>
${loose}${body}
</section>`;
}

/** The forms that decide a submission: a review, merging, and closing when the site can close submissions. */
export interface Decisions {
  readonly number: number;
  readonly head: string;
  readonly verdictAction: string;
  readonly mergeAction: string;
  /** Where Close posts, with the page to come back to. */
  readonly close?: { readonly action: string; readonly returnTo: string };
}

/**
 * The review section, while the submission is open: the forms, or, when the reviewer may not review all of it, why
 * there are none. `undefined` decisions with `blocked` false shows nothing, as when GitHub couldn't be asked.
 */
export function reviewSection({ decisions, blocked, status }: { decisions: Decisions | undefined; blocked: boolean; status: ActionStatus | undefined }): string {
  const shownStatus = status?.file === undefined ? statusLine(status) : "";
  if (!decisions) {
    if (!blocked && !shownStatus) return "";
    return `<section class="svartz-submissions-review" id="svartz-review" aria-labelledby="svartz-review-heading">
<h2 id="svartz-review-heading">Review</h2>
${shownStatus}${blocked ? "<p>You can't review every file this submission changes, so you can't approve, merge or close it here.</p>" : ""}
</section>`;
  }
  const hidden = `<input type="hidden" name="pull" value="${decisions.number}">
  <input type="hidden" name="head" value="${escape(decisions.head)}">`;
  const close = decisions.close
    ? `<form method="post" action="${escape(decisions.close.action)}">
  <input type="hidden" name="number" value="${decisions.number}">
  <input type="hidden" name="returnTo" value="${escape(decisions.close.returnTo)}">
  <button type="submit" class="sv-account-button">Close without merging</button>
</form>`
    : "";
  return `<section class="svartz-submissions-review" id="svartz-review" aria-labelledby="svartz-review-heading">
<h2 id="svartz-review-heading">Review</h2>
${shownStatus}<form class="sv-account-form" method="post" action="${escape(decisions.verdictAction)}">
  ${hidden}
  <div class="sv-account-field svartz-submissions-reply">
    <label for="svartz-review-body">Review comment</label>
    <textarea class="sv-account-input" id="svartz-review-body" name="body" rows="4" maxlength="${MAX_REPLY_LENGTH}"></textarea>
  </div>
  <div class="svartz-submissions-buttons">
    <button type="submit" class="sv-account-button" name="event" value="approve">Approve</button>
    <button type="submit" class="sv-account-button" name="event" value="request-changes">Request changes</button>
  </div>
</form>
<div class="svartz-submissions-buttons">
<form method="post" action="${escape(decisions.mergeAction)}">
  ${hidden}
  <button type="submit" class="sv-account-button" data-primary>Merge</button>
</form>
${close}
</div>
</section>`;
}

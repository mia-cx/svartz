/**
 * The history plugin's pages, as the HTML the theme's shell puts in its body. Everything a commit carries (names,
 * summaries, file content) arrives escaped or sanitized; links are built from the build's own routes.
 */
import { reputationBadgeHtml } from "@svartz/auth/badge";
import type { PluginPage } from "@svartz/core";
import type { Hunk } from "./diff";
import { escape } from "./html";

/**
 * Who made a change: an account the site vouches for, linked to its user page or else its contributions, with its
 * reputation, or a git author with their GitHub login when GitHub knows it.
 */
export type Author =
  | { readonly kind: "account"; readonly name: string; readonly handle: string; readonly href: string; readonly reputation: number }
  | { readonly kind: "github"; readonly name: string; readonly login: string | null };

/** One change as a page lists it. */
export interface Change {
  readonly sha: string;
  readonly at: string;
  readonly author: Author;
  /** `undefined` when it may not be shown: the commit changed a file the site doesn't publish, or files it can't tell. */
  readonly summary: string | undefined;
}

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "UTC" });

/** `19 Nov 2026, 13:00 UTC`, as a `<time>`. */
export const when = (iso: string) => `<time datetime="${escape(iso)}">${escape(`${dateTime.format(new Date(iso))} UTC`)}</time>`;
const plainWhen = (iso: string) => `${dateTime.format(new Date(iso))} UTC`;

function author(who: Author): string {
  if (who.kind === "account") {
    return `<span class="sv-history-who"><a class="sv-history-name" href="${escape(who.href)}">${escape(who.name)}</a> ${reputationBadgeHtml(who.reputation)} <span class="sv-history-muted">@${escape(who.handle)}</span></span>`;
  }
  if (!who.login) return `<span class="sv-history-who"><span class="sv-history-name">${escape(who.name)}</span></span>`;
  return `<span class="sv-history-who"><span class="sv-history-name">${escape(who.name)}</span> <a class="sv-history-muted" href="https://github.com/${encodeURIComponent(who.login)}" rel="external noopener">${escape(who.login)} on GitHub</a></span>`;
}

const summary = (text: string | undefined) => (text ? `<span class="sv-history-summary">${escape(text)}</span>` : "");

/** Where a history page's links go. */
export interface HistoryLinks {
  readonly page: string;
  /** The history page itself, without a query. */
  readonly history: string;
  readonly changes: string;
  /** The newer and older pages of the list, when there are any here. */
  readonly newer?: string;
  readonly older?: string;
  /** Where older changes are, when this site doesn't go back further. */
  readonly beyond?: string;
}

/** What a form's outcome says, and whether it is an error; `history` links the page's history in the text. */
interface Status {
  readonly text: string;
  readonly error?: true;
  readonly history?: true;
}

/** Revert's outcomes, by the `status` (history) or `revert` (diff) code its route redirects with. A Map: codes come from the URL. */
const REVERT_STATUSES: ReadonlyMap<string, Status> = new Map([
  ["reverted", { text: "Page reverted. It shows the restored revision once the site rebuilds." }],
  ["changed", { text: "The page changed since you opened this. Check its history, then revert again.", error: true, history: true }],
  ["unchanged", { text: "The page already reads as it did at this revision, so nothing changed.", error: true }],
  ["protected", { text: "The repository's rules don't let the site commit to this branch, so the page can't be reverted here.", error: true }],
  ["hidden", { text: "This revision wasn't public, so it can't be restored.", error: true }],
  ["route", { text: "This revision would take the address of a page you can't revert, so it can't be restored here.", error: true }],
  ["too-old", { text: "Only a page's latest 100 changes can be reverted here.", error: true }],
  ["missing", { text: "The page didn't exist at this revision.", error: true }],
  ["too-large", { text: "This revision is too large to restore here.", error: true }],
  ["busy", { text: "Other edits are being saved right now. Try again in a moment.", error: true }],
  ["github", { text: "GitHub isn't answering right now. Try again in a few minutes.", error: true }],
]);

/** The message for revert's outcome `code`, linking `history` where it says to check it; `""` for no known code. */
function revertStatus(code: string | null, history: string): string {
  const status = code === null ? undefined : REVERT_STATUSES.get(code);
  if (!status) return "";
  const text = status.history ? escape(status.text).replace("its history", `<a href="${escape(history)}">its history</a>`) : escape(status.text);
  return `<p class="sv-history-status" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${text}</p>`;
}

/** A page's history: each change, newest first, with radio pairs to compare any two. */
export function historyPage(
  { title, changes, links, previousOf, revertTo, status, unavailable }: {
    readonly title: string;
    readonly changes: readonly Change[];
    readonly links: HistoryLinks;
    /** The change before the one at `index` in this list, which its link diffs against. */
    readonly previousOf: (index: number) => string | undefined;
    /** Where reverting to the change at `index` starts, for a viewer who may revert it. */
    readonly revertTo?: (index: number) => string | undefined;
    /** The outcome of a revert, as its route redirected here. */
    readonly status?: string | null;
    /** GitHub couldn't be asked for this page's changes. */
    readonly unavailable: boolean;
  },
): PluginPage {
  const rows = changes.map((change, index) => {
    const before = previousOf(index);
    const diff = `${links.history}?${new URLSearchParams({ ...(before ? { from: before } : {}), to: change.sha })}`;
    const label = plainWhen(change.at);
    const revert = revertTo?.(index);
    return `<li class="sv-history-row">
<span class="sv-history-pick"><input type="radio" name="from" value="${escape(change.sha)}" aria-label="Compare from ${escape(label)}"${index === 1 ? " checked" : ""}><input type="radio" name="to" value="${escape(change.sha)}" aria-label="Compare to ${escape(label)}"${index === 0 ? " checked" : ""}></span>
<span class="sv-history-what"><a href="${escape(diff)}">${when(change.at)}</a> ${author(change.author)} ${summary(change.summary)}</span>
${revert ? `<a class="sv-history-revert-link" href="${escape(revert)}" aria-label="${escape(`Revert to ${label}`)}">Revert to this</a>` : ""}
</li>`;
  });
  const compare = changes.length > 1;
  const list = changes.length === 0
    ? `<p>${unavailable ? "GitHub isn't answering right now, so this page's changes can't be shown. Try again in a few minutes." : "No changes to show here."}</p>`
    : `<form class="sv-history-form" method="get" action="${escape(links.history)}">
<ol class="sv-history-list">${rows.join("")}</ol>
${compare ? `<div><button class="sv-history-button" type="submit">Compare selected</button></div>` : ""}
</form>`;
  const pager = [
    links.newer ? `<a href="${escape(links.newer)}">Newer changes</a>` : "",
    links.older ? `<a href="${escape(links.older)}">Older changes</a>` : "",
    links.beyond ? `<a href="${escape(links.beyond)}" rel="external noopener">Older changes on GitHub</a>` : "",
  ].filter(Boolean);
  const heading = `History of <a href="${escape(links.page)}">${escape(title)}</a>`;
  return {
    title: `History of ${title}`,
    html: `<div class="sv-history">
<h1>${heading}</h1>
${revertStatus(status ?? null, links.history)}
${list}
${pager.length ? `<nav class="sv-history-pager" aria-label="More changes">${pager.join("")}</nav>` : ""}
<p><a href="${escape(links.changes)}">Recent changes</a></p>
</div>`,
  };
}

/** What a diff page shows below its revisions: the source's hunks and the newer revision rendered, or why not. */
export type Comparison =
  | { readonly kind: "diff"; readonly hunks: readonly Hunk[]; readonly rendered: string | undefined }
  | { readonly kind: "too-large"; readonly github: string }
  | { readonly kind: "hidden" }
  | { readonly kind: "unavailable" };

function hunkRows(hunks: readonly Hunk[]): string {
  return hunks.map((hunk) => {
    const lines = hunk.map((line) => {
      const sign = line.kind === "add"
        ? '<span aria-hidden="true">+</span><span class="sv-history-hidden">Added</span>'
        : line.kind === "del" ? '<span aria-hidden="true">−</span><span class="sv-history-hidden">Removed</span>' : "";
      const text = escape(line.text);
      const content = line.kind === "add" ? `<ins>${text}</ins>` : line.kind === "del" ? `<del>${text}</del>` : text;
      return `<tr data-kind="${line.kind}"><td class="sv-history-num">${line.old ?? ""}</td><td class="sv-history-num">${line.new ?? ""}</td><td class="sv-history-sign">${sign}</td><td class="sv-history-line">${content}</td></tr>`;
    });
    return `<tbody>${lines.join("")}</tbody>`;
  }).join("");
}

/** The form that reverts a page to a diff's earlier revision, posting `fields` to `action`. */
export interface RevertForm {
  readonly action: string;
  readonly fields: Readonly<Record<string, string>>;
  /** When the revision it restores was made. */
  readonly at: string;
  /** The changes reverting undoes: every one since the revision. */
  readonly undone: number;
  /** The diff from the revision to the page now, when this diff ends earlier. */
  readonly current?: string;
  readonly maxReason: number;
}

const changeCount = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

/** The Revert section: `form`'s fields and button, and `status`, a revert's outcome; `""` without either. */
function revertSection(form: RevertForm | undefined, status: string): string {
  if (!form && !status) return "";
  const fields = form
    ? `<form class="sv-history-revert" method="post" action="${escape(form.action)}">
<p>Restore the page as it read at ${when(form.at)}, undoing ${escape(changeCount(form.undone))}.${form.current ? ` <a href="${escape(form.current)}">Compare that revision with the page now</a>` : ""}</p>
${Object.entries(form.fields).map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`).join("")}
<div class="sv-history-field"><label for="sv-history-reason">Reason <span class="sv-history-muted">(optional)</span></label><input class="sv-history-input" id="sv-history-reason" name="reason" maxlength="${form.maxReason}" autocomplete="off"></div>
<div><button class="sv-history-button" type="submit">Revert to this revision</button></div>
</form>`
    : "";
  return `<section class="sv-history-section" aria-labelledby="sv-history-revert">
<h2 id="sv-history-revert">Revert</h2>
${status}${fields}
</section>`;
}

/** The changes between two revisions of a page. */
export function diffPage(
  { title, revisions, comparison, links, revert, status }: {
    readonly title: string;
    /** The two revisions, `from` absent when `to` added the page; `undefined` when they couldn't be read. */
    readonly revisions: { readonly from: Change | undefined; readonly to: Change } | undefined;
    readonly comparison: Comparison;
    readonly links: Pick<HistoryLinks, "page" | "history">;
    /** The form reverting to `from`, for a viewer who may. */
    readonly revert?: RevertForm;
    /** The outcome of a revert, as its route redirected here. */
    readonly status?: string | null;
  },
): PluginPage {
  const revision = (label: string, change: Change | undefined) => `<div class="sv-history-revision">
<dt>${label}</dt>
<dd>${change ? `${when(change.at)} ${author(change.author)} ${summary(change.summary)}` : "The page didn't exist yet."}</dd>
</div>`;
  const to = revisions?.to;
  let body: string;
  switch (comparison.kind) {
    case "too-large":
      body = `<p>These revisions differ too much to show here. <a href="${escape(comparison.github)}" rel="external noopener">Compare them on GitHub</a></p>`;
      break;
    case "hidden":
      body = "<p>One of these revisions wasn't public, so its content isn't shown.</p>";
      break;
    case "unavailable":
      body = "<p>GitHub isn't answering right now, so these revisions can't be shown. Try again in a few minutes.</p>";
      break;
    case "diff":
      body = `<section class="sv-history-section" aria-labelledby="sv-history-source">
<h2 id="sv-history-source">Source</h2>
${comparison.hunks.length === 0
  ? "<p>The page's source is the same in both revisions.</p>"
  : `<table class="sv-history-diff"><thead><tr><th class="sv-history-hidden">Line before</th><th class="sv-history-hidden">Line after</th><th class="sv-history-hidden">Change</th><th class="sv-history-hidden">Text</th></tr></thead>${hunkRows(comparison.hunks)}</table>`}
</section>
${comparison.rendered === undefined || !to ? "" : `<section class="sv-history-section" aria-labelledby="sv-history-rendered">
<h2 id="sv-history-rendered">The page at ${escape(plainWhen(to.at))}</h2>
<div class="sv-prose sv-history-rendered">${comparison.rendered}</div>
</section>`}`;
  }
  return {
    title: `Changes to ${title}`,
    html: `<div class="sv-history">
<h1>Changes to <a href="${escape(links.page)}">${escape(title)}</a></h1>
${revisions ? `<dl class="sv-history-revisions">${revision("From", revisions.from)}${revision("To", revisions.to)}</dl>` : ""}
${revertSection(revert, revertStatus(status ?? null, links.history))}
${body}
<p><a href="${escape(links.history)}">History of ${escape(title)}</a></p>
</div>`,
  };
}

/** One change on Recent changes: when, who, why, and the published pages it changed. */
export interface WikiChange extends Change {
  readonly pages: ReadonlyArray<{ readonly title: string; readonly page: string; readonly diff: string; readonly history: string }>;
}

/**
 * One change as a list of the wiki's changes shows it: `time`, the pages it changed, who made it unless the list is
 * one account's (`withAuthor` false), and its summary.
 */
function wikiChangeRow(change: WikiChange, time: string, withAuthor: boolean): string {
  const pages = change.pages.map(({ title, page, diff, history }) =>
    `<span class="sv-history-page"><a class="sv-history-name" href="${escape(page)}">${escape(title)}</a> <span class="sv-history-muted">(<a href="${escape(diff)}">changes</a>, <a href="${escape(history)}">history</a>)</span></span>`);
  return `<li class="sv-history-row"><span class="sv-history-what">${time} ${pages.join(" ")} ${withAuthor ? author(change.author) : ""} ${summary(change.summary)}</span></li>`;
}

/** `changes` in a section per day, newest first, each headed at `level` (2 for `<h2>`). */
function byDay(changes: readonly WikiChange[], level: 2 | 3, withAuthor: boolean): string[] {
  const days = new Map<string, WikiChange[]>();
  for (const change of changes) {
    const key = change.at.slice(0, 10);
    days.set(key, [...days.get(key) ?? [], change]);
  }
  return [...days].map(([date, entries], index) => {
    const rows = entries.map((change) =>
      wikiChangeRow(change, `<time class="sv-history-time" datetime="${escape(change.at)}">${escape(`${clock.format(new Date(change.at))} UTC`)}</time>`, withAuthor));
    return `<section class="sv-history-section" aria-labelledby="sv-history-day-${index}">
<h${level} id="sv-history-day-${index}">${escape(day.format(new Date(`${date}T00:00:00Z`)))}</h${level}>
<ol class="sv-history-list">${rows.join("")}</ol>
</section>`;
  });
}

/** Recent changes to the whole wiki, by day, newest first. */
export function changesPage({ changes, older, unavailable }: { readonly changes: readonly WikiChange[]; readonly older?: string; readonly unavailable: boolean }): PluginPage {
  const sections = byDay(changes, 2, true);
  const empty = unavailable
    ? "<p>GitHub isn't answering right now, so changes can't be shown. Try again in a few minutes.</p>"
    : "<p>No changes yet. Changes show here once someone edits a page.</p>";
  return {
    title: "Recent changes",
    html: `<div class="sv-history">
<h1>Recent changes</h1>
${sections.length ? sections.join("") : empty}
${older ? `<nav class="sv-history-pager" aria-label="More changes"><a href="${escape(older)}">Older changes</a></nav>` : ""}
</div>`,
  };
}

/** An account's reputation, as its contributions show it. `next` is for the account itself alone. */
export interface Reputation {
  readonly score: number;
  readonly next?: { readonly role: string; readonly score: number };
}

/** One account's contributions: its changes to published pages, every page they changed, and its reputation. */
export interface Contributions {
  readonly name: string;
  readonly handle: string;
  readonly reputation: Reputation;
  readonly changes: readonly WikiChange[];
  /** Every published page the account's changes changed, most recently changed first. */
  readonly pages: ReadonlyArray<{ readonly title: string; readonly page: string }>;
}

const points = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
/** `12.5 points`, `1 point`, as the account page counts them. */
const pointsText = (score: number) => `${points.format(score)} ${score === 1 ? "point" : "points"}`;

function reputation({ score, next }: Reputation): string {
  const line = `<p class="sv-history-reputation">Reputation: <strong>${escape(pointsText(score))}</strong></p>`;
  if (!next) return line;
  return `${line}
<p class="sv-history-muted">${escape(`${pointsText(next.score - score)} to go: at ${pointsText(next.score)}, you get the ${next.role} role.`)}</p>`;
}

const pageList = (pages: Contributions["pages"]) =>
  `<ul class="sv-history-pages">${pages.map(({ title, page }) => `<li><a href="${escape(page)}">${escape(title)}</a></li>`).join("")}</ul>`;

/** An account's contributions page: its reputation, its changes by day, newest first, and the pages they changed. */
export function contributionsPage(
  view: Contributions & {
    /** The account's user page, which its name links to. */
    readonly userPage?: string;
    readonly older?: string;
    /** The site's records couldn't be read. */
    readonly unavailable: boolean;
  },
): PluginPage {
  const name = view.userPage ? `<a href="${escape(view.userPage)}">${escape(view.name)}</a>` : escape(view.name);
  const edits = view.changes.length > 0
    ? byDay(view.changes, 3, false).join("")
    : `<p>${view.unavailable ? "Edits can't be shown right now. Try again in a few minutes." : "No edits yet."}</p>`;
  return {
    title: `Contributions by ${view.name}`,
    html: `<div class="sv-history">
<h1>Contributions by ${name} <span class="sv-history-muted">@${escape(view.handle)}</span></h1>
${reputation(view.reputation)}
<section class="sv-history-section" aria-labelledby="sv-history-edits">
<h2 id="sv-history-edits">Edits</h2>
${edits}
${view.older ? `<nav class="sv-history-pager" aria-label="More edits"><a href="${escape(view.older)}">Older edits</a></nav>` : ""}
</section>
${view.pages.length > 0 ? `<section class="sv-history-section" aria-labelledby="sv-history-pages">
<h2 id="sv-history-pages">Pages edited</h2>
${pageList(view.pages)}
</section>` : ""}
</div>`,
  };
}

/**
 * The section a user page shows below its note: the account's latest changes and the pages they changed, as many as
 * the caller passes, and a link to `all`, its contributions page. Its reputation is already beside the page's actions.
 */
export function contributionsSection(view: Omit<Contributions, "reputation"> & { readonly all: string }): string {
  const rows = view.changes.map((change) => wikiChangeRow(change, when(change.at), false));
  return `<section class="sv-history sv-history-contributions" aria-labelledby="sv-history-contributions">
<h2 id="sv-history-contributions">Contributions</h2>
${rows.length > 0 ? `<h3>Latest edits</h3>
<ol class="sv-history-list">${rows.join("")}</ol>` : "<p>No edits yet.</p>"}
${view.pages.length > 0 ? `<h3>Pages edited</h3>
${pageList(view.pages)}` : ""}
<p><a href="${escape(view.all)}">All contributions</a></p>
</section>`;
}

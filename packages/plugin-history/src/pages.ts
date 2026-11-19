/**
 * The history plugin's pages, as the HTML the theme's shell puts in its body. Everything a commit carries (names,
 * summaries, file content) arrives escaped or sanitized; links are built from the build's own routes.
 */
import type { PluginPage } from "@svartz/core";
import type { Hunk } from "./diff";
import { escape } from "./html";

/** Who made a change: an account the site vouches for, or a git author with their GitHub login when GitHub knows it. */
export type Author =
  | { readonly kind: "account"; readonly name: string; readonly handle: string }
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
    return `<span class="sv-history-who"><span class="sv-history-name">${escape(who.name)}</span> <span class="sv-history-muted">@${escape(who.handle)}</span></span>`;
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

/** A page's history: each change, newest first, with radio pairs to compare any two. */
export function historyPage(
  { title, changes, links, previousOf, unavailable }: {
    readonly title: string;
    readonly changes: readonly Change[];
    readonly links: HistoryLinks;
    /** The change before the one at `index` in this list, which its link diffs against. */
    readonly previousOf: (index: number) => string | undefined;
    /** GitHub couldn't be asked for this page's changes. */
    readonly unavailable: boolean;
  },
): PluginPage {
  const rows = changes.map((change, index) => {
    const before = previousOf(index);
    const diff = `${links.history}?${new URLSearchParams({ ...(before ? { from: before } : {}), to: change.sha })}`;
    const label = plainWhen(change.at);
    return `<li class="sv-history-row">
<span class="sv-history-pick"><input type="radio" name="from" value="${change.sha}" aria-label="Compare from ${escape(label)}"${index === 1 ? " checked" : ""}><input type="radio" name="to" value="${change.sha}" aria-label="Compare to ${escape(label)}"${index === 0 ? " checked" : ""}></span>
<span class="sv-history-what"><a href="${escape(diff)}">${when(change.at)}</a> ${author(change.author)} ${summary(change.summary)}</span>
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

/** The changes between two revisions of a page. */
export function diffPage(
  { title, revisions, comparison, links }: {
    readonly title: string;
    /** The two revisions, `from` absent when `to` added the page; `undefined` when they couldn't be read. */
    readonly revisions: { readonly from: Change | undefined; readonly to: Change } | undefined;
    readonly comparison: Comparison;
    readonly links: Pick<HistoryLinks, "page" | "history">;
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
${body}
<p><a href="${escape(links.history)}">History of ${escape(title)}</a></p>
</div>`,
  };
}

/** One change on Recent changes: when, who, why, and the published pages it changed. */
export interface WikiChange extends Change {
  readonly pages: ReadonlyArray<{ readonly title: string; readonly page: string; readonly diff: string; readonly history: string }>;
}

/** Recent changes to the whole wiki, by day, newest first. */
export function changesPage({ changes, older, unavailable }: { readonly changes: readonly WikiChange[]; readonly older?: string; readonly unavailable: boolean }): PluginPage {
  const days = new Map<string, WikiChange[]>();
  for (const change of changes) {
    const key = change.at.slice(0, 10);
    days.set(key, [...days.get(key) ?? [], change]);
  }
  const sections = [...days].map(([date, entries], index) => {
    const rows = entries.map((change) => {
      const pages = change.pages.map(({ title, page, diff, history }) =>
        `<span class="sv-history-page"><a class="sv-history-name" href="${escape(page)}">${escape(title)}</a> <span class="sv-history-muted">(<a href="${escape(diff)}">changes</a>, <a href="${escape(history)}">history</a>)</span></span>`);
      return `<li class="sv-history-row"><span class="sv-history-what"><time class="sv-history-time" datetime="${escape(change.at)}">${escape(`${clock.format(new Date(change.at))} UTC`)}</time> ${pages.join(" ")} ${author(change.author)} ${summary(change.summary)}</span></li>`;
    });
    return `<section class="sv-history-section" aria-labelledby="sv-history-day-${index}">
<h2 id="sv-history-day-${index}">${escape(day.format(new Date(`${date}T00:00:00Z`)))}</h2>
<ol class="sv-history-list">${rows.join("")}</ol>
</section>`;
  });
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

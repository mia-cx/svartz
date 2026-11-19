/**
 * The pages of a note's previous versions, built from git (`history({ source: "git" })`): the list of its versions and
 * one page per version. They prerender into the theme's shell, so every link here is relative to the page's own URL.
 * Everything from git arrives escaped; a rendered version arrives sanitized.
 */
import type { Hunk } from "./diff";
import { escape } from "./html";
import { diffTable, plainWhen, when } from "./pages";

/** One version of a note as its pages show it. */
export interface Version {
  readonly at: string;
  /** The commit author's name. */
  readonly author: string;
  /** The first line of the commit's message; `undefined` when the commit changed a file the site doesn't publish. */
  readonly summary: string | undefined;
  /** Its page, relative to the page linking it, when that page links it. */
  readonly href?: string;
}

/** A page's `<title>` text and the HTML of its body. */
export interface VersionsPage {
  readonly title: string;
  readonly html: string;
}

/** When, who and why, the date linking the version's page when it has one here. */
const describe = (version: Version) =>
  `${version.href ? `<a href="${escape(version.href)}">${when(version.at)}</a>` : when(version.at)} <span class="sv-history-who"><span class="sv-history-name">${escape(version.author)}</span></span>${
    version.summary ? ` <span class="sv-history-summary">${escape(version.summary)}</span>` : ""}`;

/** Every listed version of the note `title` at `note`, newest first; `max` when older ones aren't listed. */
export function versionsPage({ title, note, versions, max }: {
  readonly title: string;
  readonly note: string;
  readonly versions: readonly Version[];
  readonly max?: number;
}): VersionsPage {
  const rows = versions.map((version) => `<li class="sv-history-row"><span class="sv-history-what">${describe(version)}</span></li>`);
  return {
    title: `Versions of ${title}`,
    html: `<div class="sv-history">
<h1>Versions of <a href="${escape(note)}">${escape(title)}</a></h1>
<ol class="sv-history-list">${rows.join("")}</ol>
${max === undefined ? "" : `<p class="sv-history-muted">Only the latest ${max} versions are listed.</p>`}
</div>`,
  };
}

/**
 * One version of the note `title`: what changed in its source since `before`, the version shown before it (absent
 * for the first), and the note as it read then.
 */
export function versionPage({ title, version, before, hunks, rendered, links }: {
  readonly title: string;
  readonly version: Version;
  readonly before: Version | undefined;
  /** The source's changes since `before`; `undefined` when there are too many to show. */
  readonly hunks: readonly Hunk[] | undefined;
  readonly rendered: string;
  readonly links: { readonly note: string; readonly versions: string; readonly newer?: string; readonly older?: string };
}): VersionsPage {
  const revision = (label: string, shown: Version | undefined) => `<div class="sv-history-revision">
<dt>${label}</dt>
<dd>${shown ? describe(shown) : "No earlier version"}</dd>
</div>`;
  const source = hunks === undefined
    ? "<p>This version changes too much of the source to show line by line.</p>"
    : hunks.length === 0 ? "<p>The source is the same in both versions.</p>" : diffTable(hunks);
  const pager = [
    links.newer ? `<a href="${escape(links.newer)}">Newer version</a>` : "",
    links.older ? `<a href="${escape(links.older)}">Older version</a>` : "",
    `<a href="${escape(links.versions)}">All versions</a>`,
  ].filter(Boolean);
  const date = plainWhen(version.at);
  return {
    title: `Changes to ${title}, ${date}`,
    html: `<div class="sv-history">
<h1>Changes to <a href="${escape(links.note)}">${escape(title)}</a></h1>
<dl class="sv-history-revisions">${revision("From", before)}${revision("To", version)}</dl>
<section class="sv-history-section" aria-labelledby="sv-history-source">
<h2 id="sv-history-source">Source</h2>
${source}
</section>
<section class="sv-history-section" aria-labelledby="sv-history-rendered">
<h2 id="sv-history-rendered">The page at ${escape(date)}</h2>
<div class="sv-prose sv-history-rendered">${rendered}</div>
</section>
<nav class="sv-history-pager" aria-label="Versions">${pager.join("")}</nav>
</div>`,
  };
}

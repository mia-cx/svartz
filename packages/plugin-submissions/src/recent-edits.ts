/**
 * The Recent edits dashboard panel, at `/-/dashboard/submissions/recent-edits/`: every mirrored commit that touched the
 * vault, newest first, whoever made it, on the site or on GitHub. Each entry names who made it, the pages it changed
 * with links to them, its summary, when, how far it has got toward live, and links to its diff on GitHub. Older
 * commits page with `?before=<sha>`, the last commit shown.
 *
 * It reads only the mirror (see `sync.ts`): rendering never calls GitHub, and a stale mirror is polled after the
 * answer. The dashboard shows the panel to viewers holding `submissions:pull-requests:read` on the vault; the panel
 * checks that again before it reads anything.
 *
 * A file is named only when the site publishes it, as a page or an attachment, so a protected, hidden or unpublished
 * note's path never shows. A commit that changed no published file, or whose files the poll hasn't read yet, shows
 * its short SHA in place of its summary, since the summary could name what the site keeps back.
 */
import { can, findProfiles, readAccount, type PublicProfile } from "@svartz/auth/server";
import type { DashboardPanel, PageContext, PluginPage } from "@svartz/core";
import { PLUGIN_ID, type LinkTarget } from "./api";
import { listCommits, type ListedCommit } from "./mirror";
import { READ_PULL_REQUESTS } from "./permissions";
import type { DeployStage, Sync } from "./sync";

export const RECENT_EDITS_TITLE = "Recent edits";
/** Commits a page of the panel shows. */
export const PAGE_SIZE = 25;
/** Pages an entry names before the rest fold away. */
const SHOWN_PAGES = 5;
const SHORT_SHA = 7;
const SHA = /^[0-9a-f]{40}$/;
/** A GitHub user's login. A bot's (`name[bot]`) doesn't match: it has no profile page under that name. */
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const STAGES: Readonly<Record<DeployStage, string>> = {
  committed: "Not live yet",
  building: "Building",
  live: "Live",
  failed: "Build failed",
};

const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const time = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What the panel needs from the plugin: the repository, and what the build published. */
export interface RecentEditsSetup {
  readonly repo: string;
  /** The vault's folder in the repository, `""` at its root. */
  readonly vaultRoot: string;
  /** The published notes, never protected or hidden ones. */
  readonly links: readonly LinkTarget[];
  /** The published attachments, as vault paths. */
  readonly attachments: readonly string[];
  readonly sync: Sync;
}

/** What a commit changed, as the site may show it. */
interface Changes {
  readonly pages: readonly LinkTarget[];
  readonly attachments: readonly string[];
  /** Files the site doesn't publish, counted and never named. */
  readonly others: number;
}

/** One entry, ready to render. */
interface Entry {
  readonly commit: ListedCommit;
  /** `null` until the poll has read the commit's files. */
  readonly changes: Changes | null;
  readonly account: PublicProfile | undefined;
  readonly stage: DeployStage;
}

/** The commit's subject line, unless it changed nothing the site publishes or its files aren't known yet. */
function summary({ commit, changes }: Entry): string | undefined {
  const subject = commit.message.split("\n", 1)[0]!.trim();
  return changes && (changes.pages.length > 0 || changes.attachments.length > 0) && subject ? subject : undefined;
}

function author({ commit, account }: Entry): string {
  if (account) return `<span class="sv-account-name">${escape(account.name)}</span> <span class="sv-account-muted">@${escape(account.handle)}</span>`;
  const login = commit.authorLogin;
  if (login && GITHUB_LOGIN.test(login)) return `<a href="https://github.com/${login}">${escape(login)}</a> on GitHub`;
  if (login) return `${escape(login)} on GitHub`;
  return commit.authorName.trim() ? `${escape(commit.authorName)} (not on GitHub)` : "Unknown author";
}

function changed(changes: Changes | null, href: (page: LinkTarget) => string): string {
  if (!changes) return `<p class="sv-account-muted">The site hasn't read which pages this changed yet.</p>`;
  const page = (target: LinkTarget) => `<li><a href="${escape(href(target))}">${escape(target.title)}</a></li>`;
  const names = [...changes.pages.map(page), ...changes.attachments.map((path) => `<li>${escape(path)}</li>`)];
  const shown = names.slice(0, SHOWN_PAGES);
  const folded = names.slice(SHOWN_PAGES);
  const others = changes.others > 0 ? `<p class="sv-account-muted">${plural(changes.others, "file the site doesn't publish", "files the site doesn't publish")}</p>` : "";
  return `${shown.length ? `<ul class="svartz-submissions-pages" aria-label="Pages changed">${shown.join("")}</ul>` : ""}${folded.length
    ? `<details class="svartz-submissions-more"><summary>${folded.length} more</summary><ul class="svartz-submissions-pages">${folded.join("")}</ul></details>`
    : ""}${others}`;
}

function entry(item: Entry, index: number, repo: string, href: (page: LinkTarget) => string): string {
  const { commit, stage } = item;
  const id = `svartz-submissions-edit-${index}`;
  const heading = summary(item) ?? `Commit ${commit.sha.slice(0, SHORT_SHA)}`;
  const diff = SHA.test(commit.sha)
    ? ` · <a href="${escape(`https://github.com/${repo}/commit/${commit.sha}`)}" aria-describedby="${id}">Diff on GitHub</a>`
    : "";
  return `<li class="svartz-submissions-edit">
<div class="svartz-submissions-edit-head"><p class="sv-account-name" id="${id}">${escape(heading)}</p><span class="svartz-submissions-stage" data-stage="${stage}">${STAGES[stage]}</span></div>
${changed(item.changes, href)}
<p class="sv-account-muted">${author(item)} · <time datetime="${escape(commit.committedAt)}">${escape(time.format(new Date(commit.committedAt)))} UTC</time>${diff}</p>
</li>`;
}

/** The panel's page: one page of entries, and links to the newest and to older ones. */
function recentEditsPage(entries: readonly Entry[], { here, older, paged, repo, href }: {
  here: string; older: string | undefined; paged: boolean; repo: string; href: (page: LinkTarget) => string;
}): PluginPage {
  const list = entries.length
    ? `<ol class="sv-account-list svartz-submissions-edits">${entries.map((item, index) => entry(item, index, repo, href)).join("\n")}</ol>`
    : `<p class="sv-account-muted">${paged ? "No older edits." : "No edits yet. Edits show here once the site has read them from GitHub."}</p>`;
  const links = [
    paged ? `<a href="${escape(here)}">Newest edits</a>` : "",
    older ? `<a href="${escape(`${here}?before=${older}`)}">Older edits</a>` : "",
  ].filter(Boolean);
  return {
    title: RECENT_EDITS_TITLE,
    html: `<div class="sv-account sv-dashboard">
<h1>${RECENT_EDITS_TITLE}</h1>
${list}
${links.length ? `<nav class="sv-dashboard-crumbs" aria-label="More edits">${links.join("")}</nav>` : ""}
</div>`,
  };
}

/** The Recent edits panel, for a plugin that syncs. */
export function recentEditsPanel({ repo, vaultRoot, links, attachments, sync }: RecentEditsSetup): DashboardPanel {
  const repoPath = (path: string) => (vaultRoot ? `${vaultRoot}/${path}` : path);
  const published = new Map(links.map((link) => [repoPath(link.path), link]));
  const files = new Map(attachments.map((path) => [repoPath(path), path]));

  const changesOf = (paths: readonly string[] | null): Changes | null => paths && {
    pages: paths.flatMap((path) => published.get(path) ?? []),
    attachments: paths.flatMap((path) => files.get(path) ?? []),
    others: paths.filter((path) => !published.has(path) && !files.has(path)).length,
  };

  return {
    id: "recent-edits",
    title: RECENT_EDITS_TITLE,
    permission: READ_PULL_REQUESTS,
    async render(request: Request, context: PageContext) {
      if (context.path !== "") return undefined;
      // The dashboard checked this before rendering; a panel never answers on that alone.
      const viewer = await readAccount(request, context.env);
      if (!await can(viewer, READ_PULL_REQUESTS, { vault: context.vault.id }, context.env)) return undefined;
      const url = new URL(request.url);
      const before = url.searchParams.get("before") ?? undefined;
      if (before !== undefined && !SHA.test(before)) return undefined;

      const mirror = await sync.read(context);
      // One more than a page says whether an older page exists.
      const commits = await listCommits(mirror, { ...(before ? { before } : {}), limit: PAGE_SIZE + 1 });
      const page = commits.slice(0, PAGE_SIZE);
      const ids = [...new Set(page.flatMap(({ account }) => account ?? []))];
      const [stages, accounts] = await Promise.all([sync.stages(context, mirror, page), findProfiles(ids, context.env)]);
      const entries = page.map((commit): Entry => ({
        commit,
        changes: changesOf(commit.files),
        account: commit.account === null ? undefined : accounts.get(commit.account),
        stage: stages.get(commit.sha) ?? "committed",
      }));
      // Links in the build are below the deployment base, which comes before `<mount>/_svartz/submissions`.
      const deploymentBase = context.base.slice(0, -`${context.vault.mountPath}/_svartz/${PLUGIN_ID}`.length);
      return recentEditsPage(entries, {
        here: url.pathname,
        older: commits.length > PAGE_SIZE ? page.at(-1)!.sha : undefined,
        paged: before !== undefined,
        repo,
        href: (target) => `${deploymentBase}${target.href}`,
      });
    },
  };
}

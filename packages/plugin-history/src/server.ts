/**
 * The history server module. It answers no routes of its own; it renders three kinds of plugin page in the theme's
 * shell, to anyone who can read the site:
 *
 * - `/-/history/<page>`: the changes to a published page, newest first in the branch's ancestry. `?page=<n>` goes back
 *   through older ones.
 * - `/-/history/<page>?to=<sha>&from=<sha>`: what changed in the page's source between two revisions, and the page
 *   at the newer one, rendered with the build's Markdown steps. Without `from`, the change to the page before `to`.
 * - `/-/changes/`: every change to a published page, newest first. `?before=<sha>` goes back further.
 *
 * Commits come from the submissions plugin's GitHub mirror, and from GitHub through it for what the mirror lacks
 * (`@svartz/plugin-submissions/commits`). Only what the site publishes shows: pages that are hidden, private or
 * password-protected have no history, and a change to one never shows on Recent changes, nor does the summary of any
 * commit that changed one. A revision whose frontmatter hid or protected it shows no content.
 */
import type { PageContext, PageResult, ServerModuleFactory } from "@svartz/core";
import { findProfiles } from "@svartz/auth/server";
import { commitReader, CommitsUnavailable, type Commit, type CommitReader } from "@svartz/plugin-submissions/commits";
import type { PreviewNote } from "@svartz/plugins/preview";
import { PLUGIN_ID, type HistoryData } from "./api";
import { diffLines } from "./diff";
import { changesPage, diffPage, historyPage, type Author, type Change, type Comparison, type WikiChange } from "./pages";
import { renderRevision, wasPublic } from "./render";

/** Pages of a file's history readers may page back through; older ones are on GitHub. */
export const MAX_HISTORY_PAGE = 10;
const SHA = /^[0-9a-f]{40}$/;
const PAGE_NUMBER = /^(?:0|[1-9]\d?)$/;

const history: ServerModuleFactory<unknown, HistoryData> = (_options, data) => {
  const read = commitReader(data.source);
  const notes = new Map(data.notes.filter(({ path }) => /\.md$/i.test(path)).map((note) => [note.href, note]));
  const byPath = new Map(data.notes.filter(({ path }) => /\.md$/i.test(path)).map((note) => [note.path, note]));
  const published = new Set([...data.notes.map(({ path }) => path), ...data.preview.attachments]);
  const { repo, root, branch } = data.source;
  const repoPath = (path: string) => (root ? `${root}/${path}` : path);

  /** A commit's summary, unless it changed a file the site doesn't publish, or files nobody listed in full. */
  const shownSummary = (commit: Commit) =>
    commit.allFiles && commit.files !== null && commit.files.every((file) => published.has(file)) ? commit.summary : undefined;

  /** Every URL a page links to, from the plugin's own `context.base`: `<deployment base><mount>/_svartz/history`. */
  function urls(context: PageContext) {
    const mount = context.vault.mountPath;
    const deployment = context.base.slice(0, -`${mount}/_svartz/${PLUGIN_ID}`.length);
    return {
      deployment,
      page: (note: PreviewNote) => encodeURI(`${deployment}${note.href}`),
      history: (note: PreviewNote, query?: Record<string, string>) =>
        `${encodeURI(`${deployment}${mount}/-/history${note.href.slice(mount.length)}`)}${query ? `?${new URLSearchParams(query)}` : ""}`,
      changes: (query?: Record<string, string>) => `${encodeURI(`${deployment}${mount}/-/changes/`)}${query ? `?${new URLSearchParams(query)}` : ""}`,
    };
  }

  /**
   * `commits` as the pages show them. Each is by the account the site's records name, under its current handle and
   * name, or by its git author.
   */
  async function changesOf(commits: readonly Commit[], context: PageContext): Promise<Change[]> {
    const profiles = await findProfiles([...new Set(commits.flatMap((commit) => commit.account ? [commit.account.id] : []))], context.env);
    return commits.map((commit) => {
      const profile = commit.account && profiles.get(commit.account.id);
      // An account that no longer exists shows as git names the commit.
      const author: Author = profile
        ? { kind: "account", name: profile.name, handle: profile.handle }
        : { kind: "github", name: commit.author.name, login: commit.author.login };
      return { sha: commit.sha, at: commit.committedAt, author, summary: shownSummary(commit) };
    });
  }

  async function listPage(note: PreviewNote, page: number, reader: CommitReader, context: PageContext): Promise<PageResult> {
    const link = urls(context);
    let commits: readonly Commit[] = [];
    let more = false;
    let unavailable = false;
    try {
      ({ commits, more } = await reader.history(note.path, page));
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      unavailable = true;
    }
    reader.refresh();
    const changes = await changesOf(commits, context);
    const github = `https://github.com/${repo}/commits/${encodeURIComponent(branch ?? "HEAD")}/${encodeURI(repoPath(note.path))}`;
    return historyPage({
      title: note.title,
      changes,
      unavailable,
      previousOf: (index) => changes[index + 1]?.sha,
      links: {
        page: link.page(note),
        history: link.history(note),
        changes: link.changes(),
        ...(page > 0 ? { newer: link.history(note, page > 1 ? { page: String(page - 1) } : undefined) } : {}),
        ...(more && page < MAX_HISTORY_PAGE ? { older: link.history(note, { page: String(page + 1) }) } : {}),
        ...(more && page >= MAX_HISTORY_PAGE ? { beyond: github } : {}),
      },
    });
  }

  /** Whether `text`, a revision's content, may show: a file the build would have published unprotected. */
  const visible = (file: Awaited<ReturnType<CommitReader["file"]>>) => file.kind !== "file" || wasPublic(file.markdown);

  /** What changed in `note`'s source from `from` to `to`, and `to` rendered, unless either may not show. */
  async function compare(note: PreviewNote, from: Commit | undefined, to: Commit, reader: CommitReader, deployment: string): Promise<Comparison> {
    const after = await reader.file(note.path, to.sha);
    const before = from ? await reader.file(note.path, from.sha) : { kind: "missing" as const };
    if (!visible(after) || !visible(before)) return { kind: "hidden" };
    const github = from ? `https://github.com/${repo}/compare/${from.sha}...${to.sha}` : to.url;
    if (after.kind === "too-large" || before.kind === "too-large") return { kind: "too-large", github };
    const hunks = diffLines(before.kind === "file" ? before.markdown : "", after.kind === "file" ? after.markdown : "");
    if (!hunks) return { kind: "too-large", github };
    const rendered = after.kind === "file"
      ? await renderRevision(after.markdown, { ...data.preview, notes: data.notes, path: note.path, base: deployment })
      : undefined;
    return { kind: "diff", hunks, rendered };
  }

  async function diff(note: PreviewNote, toSha: string, fromSha: string | null, reader: CommitReader, context: PageContext): Promise<PageResult | undefined> {
    const link = urls(context);
    const page = (revisions: Parameters<typeof diffPage>[0]["revisions"], comparison: Comparison) =>
      diffPage({ title: note.title, revisions, comparison, links: { page: link.page(note), history: link.history(note) } });
    let to: Commit | undefined;
    let from: Commit | undefined;
    let comparison: Comparison;
    try {
      to = await reader.commit(toSha);
      if (!to) return undefined;
      from = fromSha === null ? await reader.previous(note.path, to.sha) : await reader.commit(fromSha);
      if (fromSha !== null && !from) return undefined;
      comparison = await compare(note, from, to, reader, link.deployment);
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      if (!to) return page(undefined, { kind: "unavailable" });
      comparison = { kind: "unavailable" };
    }
    const [shownTo, shownFrom] = await changesOf(from ? [to, from] : [to], context);
    return page({ from: shownFrom, to: shownTo! }, comparison);
  }

  async function changes(before: string | null, reader: CommitReader, context: PageContext): Promise<PageResult> {
    const link = urls(context);
    let page: Awaited<ReturnType<CommitReader["recent"]>> = { commits: [] };
    let unavailable = false;
    try {
      page = await reader.recent(before ?? undefined);
    } catch (error) {
      if (!(error instanceof CommitsUnavailable)) throw error;
      unavailable = true;
    }
    reader.refresh();
    const shown = await changesOf(page.commits, context);
    const listed = page.commits.flatMap((commit, index): WikiChange[] => {
      const pages = (commit.files ?? []).flatMap((path) => {
        const note = byPath.get(path);
        return note ? [{ title: note.title, page: link.page(note), diff: link.history(note, { to: commit.sha }), history: link.history(note) }] : [];
      });
      return pages.length ? [{ ...shown[index]!, pages }] : [];
    });
    return changesPage({
      changes: listed,
      unavailable,
      ...(page.next ? { older: link.changes({ before: page.next }) } : {}),
    });
  }

  return {
    page: async (request, context) => {
      const query = new URL(request.url).searchParams;
      const reader = read(context);
      if (context.path === "changes/") {
        const before = query.get("before");
        if (before !== null && !SHA.test(before)) return undefined;
        return changes(before, reader, context);
      }
      if (!context.path.startsWith("history/")) return undefined;
      const note = notes.get(`${context.vault.mountPath}${context.path.slice("history".length)}`);
      if (!note) return undefined;
      const to = query.get("to");
      if (to !== null) {
        const from = query.get("from");
        if (!SHA.test(to) || (from !== null && !SHA.test(from))) return undefined;
        return diff(note, to, from, reader, context);
      }
      const page = query.get("page") ?? "0";
      if (!PAGE_NUMBER.test(page) || Number(page) > MAX_HISTORY_PAGE) return undefined;
      return listPage(note, Number(page), reader, context);
    },
  };
};

export default history;

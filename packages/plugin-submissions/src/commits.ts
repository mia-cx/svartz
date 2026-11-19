/**
 * `@svartz/plugin-submissions/commits`: what the GitHub mirror knows about the content branch's commits, for other
 * plugins to read without touching the mirror's tables or holding GitHub credentials of their own. Page history and
 * Recent changes (`@svartz/plugin-history`) read it.
 *
 * At build time, {@link mirrorsCommits} says whether a vault's submissions plugin keeps the mirror (`sync` set), and
 * {@link commitSource} hands over what reading it takes, for the reader's own server data. At runtime,
 * {@link commitReader} reads the mirror and asks GitHub for what it can't answer: a file's history in the branch's
 * order, commits it doesn't hold, and file content at a commit. Every GitHub request goes through the submissions
 * plugin's credentials and honours the pause it shares with the reconcile poll, so reads never spend the requests the
 * poll keeps for saves; each reader makes at most {@link MAX_GITHUB_READS} of them.
 *
 * Paths are vault paths, such as `guides/setup.md`; the mirror's repository paths stay inside this module. Text from
 * a commit (messages, names) is as GitHub sent it, for whoever shows it to escape.
 */
import {
  getCompilerContributions,
  type NormalizedSvartzPlugin,
  type PluginContext,
  type ServerContext,
  type SvartzPlugin,
} from "@svartz/core";
import { MAX_MARKDOWN_BYTES, PLUGIN_ID } from "./api";
import { appTokens } from "./app";
import { misconfigured } from "./errors";
import { requestGitHub } from "./github";
import { isDatabase, migrate, readBranch, scopeOf, type Mirror } from "./mirror";
import { hasNextPage, pause, readPause, reconcile, resumeAt } from "./reconcile";
import { inVault, list, listedCommit, object, text, type CommitRecord } from "./records";
import type { RouteClaims } from "./claims";
import type { BuildData, Credentials, ServerOptions } from "./server";

/** What reading a vault's commits takes: JSON, for the reader's server data. Holds no secret, only where they are. */
export interface CommitSource {
  /** `owner/name`. */
  readonly repo: string;
  /** The content branch; the repository's default branch when unset. */
  readonly branch?: string;
  /** The vault's folder in the repository, `""` at its root. */
  readonly root: string;
  readonly credentials: Credentials;
  /** The D1 binding the mirror lives in. */
  readonly database: { readonly env: string };
  /** The deployment environment that means live, which the reconcile poll lists deployments of. */
  readonly environment?: string;
}

/** A commit on the content branch. */
export interface Commit {
  readonly sha: string;
  /** The commit on GitHub. */
  readonly url: string;
  /** ISO 8601. */
  readonly committedAt: string;
  /**
   * What it says it changed: for a save the site committed, the note its editor wrote, empty when they wrote none;
   * otherwise the message's first line.
   */
  readonly summary: string;
  /** Its git author, and their GitHub login when GitHub linked the commit to an account. */
  readonly author: { readonly name: string; readonly login: string | null };
  /**
   * The site account behind it, only when the site's own record says so: a save the site committed as this commit,
   * or a submission the site opened as a pull request that this commit merged. Git metadata (the author, the
   * committer, a `Svartz-Account` trailer) is whatever its maker wrote, so it never names an account.
   */
  readonly account: { readonly id: string } | null;
  /** The vault files it changed, as vault paths; `null` while unknown, as for commits read from GitHub's lists. */
  readonly files: readonly string[] | null;
  /**
   * Whether `files` holds every vault file it changed. GitHub lists a commit's files in pages past 300 and stops at
   * 3,000, and only the first page is read, so a larger commit's `files` are a part of them.
   */
  readonly allFiles: boolean;
}

/** The content at a commit, or why there is none to show. */
export type FileAt =
  | { readonly kind: "file"; readonly markdown: string }
  /** Nothing at that path in that commit, as before a page was added. */
  | { readonly kind: "missing" }
  /** Larger than {@link MAX_FILE_BYTES}. */
  | { readonly kind: "too-large" };

/** GitHub can't be asked right now: the shared pause holds, this reader's requests are spent, or GitHub failed. */
export class CommitsUnavailable extends Error {
  constructor(message = "GitHub can't be asked right now") {
    super(message);
    this.name = "CommitsUnavailable";
  }
}

/** Reads one request's worth of commits. Make one per request with {@link commitReader}. */
export interface CommitReader {
  /**
   * The commits that changed `path`, a page of {@link GITHUB_PAGE_SIZE} at a time, in the branch's order: GitHub's
   * list for the file, which walks the branch's ancestry, with what the mirror knows of each. The mirror can't order
   * them itself: commit times tie and can be backdated, and push deliveries don't name a commit's parents. `more` says
   * whether GitHub may hold older ones. Renames aren't followed: the history of a moved file starts at the move.
   */
  history(path: string, page: number): Promise<{ readonly commits: readonly Commit[]; readonly more: boolean }>;
  /**
   * The commits that changed a vault file, newest commit time first, from the mirror only: those whose files it
   * knows. `before` is the sha of the last commit of the previous page; `next` is this page's, when there may be more.
   */
  recent(before?: string): Promise<{ readonly commits: readonly Commit[]; readonly next?: string }>;
  /**
   * The commits the site's records say the account `account` (its id) made, from the mirror only, as
   * {@link recent} pages them: `limit` at a time (default {@link RECENT_PAGE_SIZE}), newest commit time first,
   * `before` the last sha of the previous page. Only those whose files the mirror knows. `files` is every vault file
   * any of its commits changed, most recently changed first, whichever page is asked for. One D1 batch, then one query.
   */
  madeBy(account: string, options?: { readonly before?: string; readonly limit?: number }): Promise<{
    readonly commits: readonly Commit[];
    readonly next?: string;
    readonly files: readonly string[];
  }>;
  /** Whether `sha` is a commit on the content branch of the repository, never one of a fork's. */
  onBranch(sha: string): Promise<boolean>;
  /** The commit `sha`, when it is on the content branch. */
  commit(sha: string): Promise<Commit | undefined>;
  /**
   * The commit that changed `path` before `sha` did, by `sha`'s ancestry as GitHub's list for the file walks it;
   * `undefined` too when `sha` isn't on the content branch.
   */
  previous(path: string, sha: string): Promise<Commit | undefined>;
  /** `path`'s content at commit `sha`; `missing` too when `sha` isn't on the content branch. */
  file(path: string, sha: string): Promise<FileAt>;
  /**
   * `path`'s content at `sha`, the head commit GitHub just named for one of this repository's open pull requests,
   * which needn't be on the content branch. The caller vouches for `sha`: never pass one a reader sent.
   */
  headFile(path: string, sha: string): Promise<FileAt>;
  /** Have the reconcile poll read GitHub after the answer, when the mirror is stale; it backfills on its first run. */
  refresh(): void;
}

/**
 * GitHub requests one reader may make: what the costliest page, a diff of two revisions the mirror doesn't hold,
 * needs. That is the default branch's name, when neither config nor the mirror knows it, then for each revision the
 * check that the branch holds it, the commit, and the page's file at it.
 */
export const MAX_GITHUB_READS = 7;
/** Commits per page of GitHub's list, its most. */
export const GITHUB_PAGE_SIZE = 100;
/** Commits per page of {@link CommitReader.recent}. */
export const RECENT_PAGE_SIZE = 50;
/** File content larger than this isn't read; a note the editor accepts is far smaller. */
export const MAX_FILE_BYTES = MAX_MARKDOWN_BYTES * 2;
/** File contents a worker keeps: a commit's file never changes. */
const CACHED_FILES = 64;
/** Commits a worker remembers as on the content branch. */
const CACHED_BRANCH_COMMITS = 1024;
const SHA = /^[0-9a-f]{40}$/;

/** The submissions plugin among `plugins` that keeps the mirror: enabled, with a server, and `sync` set. */
function syncing(plugins: readonly unknown[]): ServerOptions | undefined {
  const plugin = (plugins as readonly (SvartzPlugin | NormalizedSvartzPlugin)[]).find(({ id }) => id === PLUGIN_ID);
  const options = plugin?.server?.options as ServerOptions | undefined;
  return plugin && !plugin.disabled && options?.sync ? options : undefined;
}

/** Whether one of a vault's `plugins` is a submissions plugin keeping the GitHub mirror. For a plugin's `forVault`. */
export const mirrorsCommits = (plugins: readonly unknown[]): boolean => syncing(plugins) !== undefined;

/**
 * What reading the vault's commits takes, or `undefined` when no submissions plugin keeps its mirror. Call it from
 * `emitArtifacts` with `enforce: "post"`: the vault's folder in the repository is what the submissions plugin's own
 * `emitArtifacts` read from git.
 */
export function commitSource(ctx: PluginContext): CommitSource | undefined {
  const options = syncing(ctx.plugins ?? ctx.config.plugins ?? []);
  const data = getCompilerContributions(ctx).serverData.get(PLUGIN_ID) as BuildData | undefined;
  if (!options?.sync || !data) return undefined;
  const credentials: Credentials = options.app ? { app: options.app } : { token: options.token! };
  const { environment } = options.sync.live;
  return {
    repo: options.repo,
    ...(options.branch ? { branch: options.branch } : {}),
    root: data.vaultRoot,
    credentials,
    database: options.sync.database,
    ...(environment ? { environment } : {}),
  };
}

/**
 * The routes the vault's pages hold, hidden and protected ones included, which a page's frontmatter can claim: what
 * `@svartz/plugin-submissions/restore` checks a restored revision against. From `emitArtifacts` with `enforce: "post"`,
 * as {@link commitSource}; `undefined` without the submissions plugin.
 */
export function routeClaimsOf(ctx: PluginContext): RouteClaims | undefined {
  const data = getCompilerContributions(ctx).serverData.get(PLUGIN_ID) as BuildData | undefined;
  return data && { routes: data.routes, aliases: data.aliases, aliasesField: data.aliasesField };
}

interface CommitRow {
  sha: string;
  message: string;
  author_name: string;
  author_login: string | null;
  committed_at: string;
  url: string;
  files: string | null;
  files_complete: number;
}

const COMMIT_COLUMNS = "c.sha, c.message, c.author_name, c.author_login, c.committed_at, c.url, c.files, c.files_complete";

/** The site's record of making a commit: who saved it (`account:<id>`, `identity:<id>` or `null`), and how. */
interface Made {
  owner: string | null;
  kind: "commit" | "pull-request";
}

/**
 * The saves the site recorded as each of the commits `?2` (a JSON array): a direct commit by its sha, a submission by
 * its pull request's merge commit, as the mirror knows it from GitHub's signed deliveries. Earliest save first.
 */
const MADE_BY_SITE = `SELECT sha, owner, kind FROM (
    SELECT e.commit_sha AS sha, e.owner, e.kind, e.saved_at, e.id FROM submissions_edits e
      WHERE e.scope = ?1 AND e.kind = 'commit' AND e.commit_sha IN (SELECT value FROM json_each(?2))
    UNION ALL
    SELECT p.merge_commit AS sha, e.owner, e.kind, e.saved_at, e.id FROM submissions_edits e
      JOIN submissions_pulls p ON p.scope = e.scope AND p.number = e.pull_number
      WHERE e.scope = ?1 AND e.kind = 'pull-request' AND p.merged_at IS NOT NULL
        AND p.merge_commit IN (SELECT value FROM json_each(?2))
  ) ORDER BY saved_at, id`;

/**
 * The commits {@link MADE_BY_SITE} credits to `?2` (`account:<id>`): its direct commits, and the merge commits of the
 * pull requests whose first recorded save is its own. Its parameters are `?1`, the scope, and `?2`.
 */
const MADE_BY_ACCOUNT = `SELECT e.commit_sha FROM submissions_edits e
    WHERE e.scope = ?1 AND e.owner = ?2 AND e.kind = 'commit' AND e.commit_sha IS NOT NULL
  UNION
  SELECT p.merge_commit FROM submissions_edits e JOIN submissions_pulls p ON p.scope = e.scope AND p.number = e.pull_number
    WHERE e.scope = ?1 AND e.owner = ?2 AND e.kind = 'pull-request' AND p.merged_at IS NOT NULL AND p.merge_commit IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM submissions_edits o WHERE o.scope = ?1 AND o.kind = 'pull-request'
        AND o.pull_number = e.pull_number AND (o.saved_at, o.id) < (e.saved_at, e.id))`;

/** The note a saved edit's message carries between its title and its trailers. */
function savedNote(message: string): string {
  const paragraphs = message.trimEnd().split(/\n\s*\n/);
  return paragraphs.slice(1, -1).join("\n\n").trim();
}

/** The token `source`'s credentials authenticate with: the configured one, or the App's installation token, kept. */
export function sourceToken({ repo, credentials }: CommitSource): (env: ServerContext["env"]) => Promise<string> {
  return credentials.app ? appTokens(repo, credentials.app) : async (env) => {
    const value = env[credentials.token.env];
    if (typeof value !== "string" || !value) throw misconfigured(`its server has no ${credentials.token.env} set`);
    return value;
  };
}

/**
 * Reads commits for one vault. The answer makes a {@link CommitReader} per request; installation tokens and file
 * contents are kept across requests in this worker. Pass `token` to share one {@link sourceToken} with a writer.
 */
export function commitReader(source: CommitSource, token = sourceToken(source)): (context: ServerContext) => CommitReader {
  const { repo, root } = source;
  const files = new Map<string, FileAt>();
  /** Commits known to be on the content branch. One that is stays on it; one that isn't may land, so it is asked again. */
  const held = new Set<string>();
  const hold = (sha: string) => {
    held.add(sha);
    if (held.size > CACHED_BRANCH_COMMITS) held.delete(held.values().next().value!);
  };
  const repoPath = (path: string) => (root ? `${root}/${path}` : path);
  const vaultPath = (path: string) => (root ? path.slice(root.length + 1) : path);
  const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

  return (context) => {
    let reads = 0;
    let mirror: Promise<Mirror> | undefined;
    let branchName: Promise<string> | undefined;

    function mirrorFor(): Promise<Mirror> {
      mirror ??= (async () => {
        const db = context.env[source.database.env];
        if (!isDatabase(db)) throw new CommitsUnavailable(`no D1 database is bound as ${source.database.env}`);
        await migrate(db);
        return { db, scope: scopeOf(repo, root) };
      })();
      return mirror;
    }

    /** Spend one of this reader's requests, unless they're spent or the scope is paused. */
    async function spend(): Promise<void> {
      if (reads >= MAX_GITHUB_READS || await readPause(await mirrorFor()) > Date.now()) throw new CommitsUnavailable();
      reads++;
    }

    /** GET `path` below the repository, as the poll does: a request that says to wait pauses the poll too. */
    async function get(path: string, accept?: string): Promise<Response> {
      await spend();
      let response: Response;
      try {
        response = await requestGitHub(await token(context.env), "GET", `/repos/${repo}${path}`, undefined, accept);
      } catch (cause) {
        throw new CommitsUnavailable(cause instanceof Error ? cause.message : String(cause));
      }
      const resume = await resumeAt(response, Date.now());
      if (resume) await pause(await mirrorFor(), resume);
      if (!response.ok && response.status !== 404) throw new CommitsUnavailable(`GitHub answered ${response.status}`);
      return response;
    }

    /** The content branch: configured, or the default branch's name as the mirror or, once per reader, GitHub says. */
    function branch(): Promise<string> {
      branchName ??= (async () => {
        if (source.branch) return source.branch;
        const known = await readBranch(await mirrorFor());
        if (known) return known;
        const name = text(object(await (await get("")).json().catch(() => undefined))?.default_branch);
        if (!name) throw new CommitsUnavailable("GitHub named no default branch");
        return name;
      })();
      return branchName;
    }

    /** `rows` as commits, each with the account the site's records say made it. */
    async function toCommits(rows: readonly CommitRow[]): Promise<Commit[]> {
      if (rows.length === 0) return [];
      const { db, scope } = await mirrorFor();
      const made = new Map<string, Made>();
      const { results } = await db.prepare(MADE_BY_SITE).bind(scope, JSON.stringify(rows.map(({ sha }) => sha))).all<Made & { sha: string }>();
      for (const { sha, ...record } of results) if (!made.has(sha)) made.set(sha, record);
      return rows.map((row) => {
        const record = made.get(row.sha);
        const account = record?.owner?.startsWith("account:") ? { id: record.owner.slice("account:".length) } : null;
        return {
          sha: row.sha,
          url: row.url,
          committedAt: row.committed_at,
          // A save's message is the site's own, with the editor's note; a merge commit's is whatever GitHub or its merger wrote.
          summary: account && record?.kind === "commit" ? savedNote(row.message) : row.message.split("\n", 1)[0]!.trim(),
          author: { name: row.author_name, login: row.author_login },
          account,
          files: row.files === null ? null : (JSON.parse(row.files) as string[]).map(vaultPath),
          allFiles: row.files !== null && row.files_complete === 1,
        };
      });
    }

    async function rows(where: string, ...values: unknown[]): Promise<CommitRow[]> {
      const { db, scope } = await mirrorFor();
      return (await db.prepare(`SELECT ${COMMIT_COLUMNS} FROM submissions_commits c WHERE c.scope = ? AND ${where}`)
        .bind(scope, ...values).all<CommitRow>()).results;
    }

    /** Commits GitHub listed, with what the mirror knows of each: its files, and the site's record of it. */
    async function listed(values: readonly unknown[]): Promise<Commit[]> {
      const records = values.flatMap((value) => listedCommit(value) ?? []);
      if (records.length === 0) return [];
      const known = new Map((await rows("c.sha IN (SELECT value FROM json_each(?))", JSON.stringify(records.map(({ sha }) => sha))))
        .map((row) => [row.sha, row]));
      return toCommits(records.map((record: CommitRecord) => known.get(record.sha) ?? {
        sha: record.sha,
        message: record.message,
        author_name: record.authorName,
        author_login: record.authorLogin,
        committed_at: record.committedAt,
        url: record.url,
        files: null,
        files_complete: 0,
      }));
    }

    const newestFirst = "ORDER BY c.committed_at DESC, c.sha DESC";

    /**
     * A page of GitHub's list of the commits that changed `path`, from `from` back: the branch, or a commit known to
     * be on it. Every commit listed is an ancestor of `from`, so on the branch too.
     */
    async function githubList(path: string, from: string, page: number, size = GITHUB_PAGE_SIZE): Promise<Commit[]> {
      const query = new URLSearchParams({ sha: from, path: repoPath(path), per_page: String(size), page: String(page) });
      const response = await get(`/commits?${query}`);
      const commits = response.status === 404 ? [] : await listed(list(await response.json()));
      for (const { sha } of commits) hold(sha);
      return commits;
    }

    const reader: CommitReader = {
      async history(path, page) {
        const commits = await githubList(path, await branch(), page + 1);
        return { commits, more: commits.length === GITHUB_PAGE_SIZE };
      },

      async recent(before) {
        const cursor = before === undefined ? undefined : (await rows("c.sha = ?", before))[0];
        if (before !== undefined && !cursor) return { commits: [] };
        const page = cursor
          ? await rows(`c.files IS NOT NULL AND (c.committed_at, c.sha) < (?, ?) ${newestFirst} LIMIT ?`, cursor.committed_at, cursor.sha, RECENT_PAGE_SIZE)
          : await rows(`c.files IS NOT NULL ${newestFirst} LIMIT ?`, RECENT_PAGE_SIZE);
        const commits = await toCommits(page);
        return { commits, ...(page.length === RECENT_PAGE_SIZE ? { next: page.at(-1)!.sha } : {}) };
      },

      async madeBy(account, { before, limit = RECENT_PAGE_SIZE } = {}) {
        const { db, scope } = await mirrorFor();
        const owner = `account:${account}`;
        // A `before` the mirror doesn't hold compares with NULL, so it answers no commits.
        const [page, changed] = await db.batch([
          db.prepare(`SELECT ${COMMIT_COLUMNS} FROM submissions_commits c WHERE c.scope = ?1 AND c.files IS NOT NULL
              AND c.sha IN (${MADE_BY_ACCOUNT})
              AND (?3 IS NULL OR (c.committed_at, c.sha) < (SELECT committed_at, sha FROM submissions_commits WHERE scope = ?1 AND sha = ?3))
            ${newestFirst} LIMIT ?4`).bind(scope, owner, before ?? null, limit),
          db.prepare(`SELECT j.value AS path FROM submissions_commits c, json_each(c.files) j
            WHERE c.scope = ?1 AND c.files IS NOT NULL AND c.sha IN (${MADE_BY_ACCOUNT})
            GROUP BY j.value ORDER BY MAX(c.committed_at) DESC, j.value`).bind(scope, owner),
        ]) as [{ results: CommitRow[] }, { results: { path: string }[] }];
        const commits = await toCommits(page.results);
        return {
          commits,
          ...(page.results.length === limit ? { next: page.results.at(-1)!.sha } : {}),
          files: changed.results.map(({ path }) => vaultPath(path)),
        };
      },

      async onBranch(sha) {
        if (!SHA.test(sha)) return false;
        if (held.has(sha)) return true;
        // The mirror holds only commits on the content branch.
        if ((await rows("c.sha = ?", sha)).length > 0) return true;
        const response = await get(`/compare/${sha}...${encodeURIComponent(await branch())}?per_page=1`);
        const status = response.ok ? text(object(await response.json())?.status) : undefined;
        // The branch is at or ahead of the commit: it holds it. A fork's commit, or a stranger, is never behind it.
        const holds = status === "ahead" || status === "identical";
        if (holds) hold(sha);
        return holds;
      },

      async commit(sha) {
        if (!await reader.onBranch(sha)) return undefined;
        const [row] = await rows("c.sha = ?", sha);
        if (row) return (await toCommits([row]))[0];
        const response = await get(`/commits/${sha}`);
        if (!response.ok) return undefined;
        const body = await response.json();
        const [commit] = await listed([body]);
        if (!commit) return undefined;
        // A rename changed its old path too, as the mirror records it.
        const changed = list(object(body)?.files).flatMap((file) =>
          [text(object(file)?.filename), text(object(file)?.previous_filename)]
            .flatMap((name) => (name !== undefined && inVault(name, root) ? [vaultPath(name)] : [])));
        return { ...commit, files: changed.sort(), allFiles: !hasNextPage(response) };
      },

      async previous(path, sha) {
        if (!await reader.onBranch(sha)) return undefined;
        // GitHub lists `sha` itself first when it changed the file, then the one before.
        const [first, second] = await githubList(path, sha, 1, 2);
        return first?.sha === sha ? second : first;
      },

      async file(path, sha) {
        if (!await reader.onBranch(sha)) return { kind: "missing" };
        return reader.headFile(path, sha);
      },

      async headFile(path, sha) {
        const key = `${sha}:${path}`;
        const cached = files.get(key);
        if (cached) return cached;
        const response = await get(`/contents/${encodePath(repoPath(path))}?ref=${sha}`, "application/vnd.github.raw");
        let answer: FileAt;
        if (response.status === 404) {
          answer = { kind: "missing" };
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          answer = bytes.byteLength > MAX_FILE_BYTES
            ? { kind: "too-large" }
            : { kind: "file", markdown: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
        }
        files.set(key, answer);
        // Oldest out first: a Map iterates in insertion order.
        if (files.size > CACHED_FILES) files.delete(files.keys().next().value!);
        return answer;
      },

      refresh() {
        context.waitUntil(mirrorFor().then((target) => reconcile({
          mirror: target,
          repo,
          root,
          ...(source.branch ? { branch: source.branch } : {}),
          ...(source.environment ? { environment: source.environment } : {}),
        }, () => token(context.env))).catch((error: unknown) => {
          console.warn(`[submissions] couldn't refresh the GitHub mirror: ${error instanceof Error ? error.message : String(error)}`);
        }));
      },
    };
    return reader;
  };
}

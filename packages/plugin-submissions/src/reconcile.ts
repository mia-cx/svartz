/**
 * The reconcile poll: reads what GitHub holds now into the mirror, for the deliveries a webhook missed. It runs when
 * a reader's request finds the mirror stale, never on a timer, and at most once per {@link POLL_INTERVAL_MS} per
 * scope across every isolate, claimed through a lease in D1. Its first run backfills.
 *
 * Each poll lists, newest first and one page each: the content branch's workflow runs, deployments, pull requests into
 * it, the commits touching the vault, and the comments on pull requests. Lists are conditional (`If-None-Match` with
 * the ETag GitHub last sent), so a list that hasn't changed costs a 304. Then, while its budget of
 * {@link MAX_REQUESTS} lasts, it fills in what the lists leave out: deployments' statuses, which pull requests touch
 * the vault, their reviews, commits' files, and the lines each landed save changed, for reputation. What it doesn't
 * reach waits in the mirror for the next poll.
 *
 * It keeps {@link RATE_LIMIT_RESERVE} requests of GitHub's hourly allowance for saves: below that it stops and polls
 * again only after the reset, and on a rate limit it waits as GitHub says (`Retry-After`, else the reset when the
 * allowance is spent, else a minute). The pause is kept in D1 and shared with status reads' ancestry checks, which
 * keep the same reserve; each reads it before every request.
 */
import { vaultLines } from "./credit";
import { requestGitHub } from "./github";
import {
  markSucceeded,
  writeBranch,
  writeComment,
  writeCommit,
  writeDeployment,
  writePull,
  writeReview,
  writeRun,
  type Mirror,
  type Statement,
} from "./mirror";
import {
  comment,
  deployment,
  deploymentStatus,
  inVault,
  list,
  listedCommit,
  object,
  pullNumber,
  pullRequest,
  review,
  text,
  workflowRun,
  type DeploymentStatus,
} from "./records";

/** A poll runs at most this often per scope. */
export const POLL_INTERVAL_MS = 60_000;
/** A poll that hasn't finished by then lets the next one start. */
const LEASE_MS = 60_000;
/** GitHub requests one poll may make. */
export const MAX_REQUESTS = 30;
/** Requests of GitHub's hourly allowance a poll leaves for saves. */
export const RATE_LIMIT_RESERVE = 100;
/** Items per list; also how far the first poll backfills. */
const PAGE_SIZE = 100;
/** Rows of each kind a poll fills in at most, before the budget decides. */
const FILL_BATCH = 10;
const MS_PER_SECOND = 1000;

export interface PollTarget {
  readonly mirror: Mirror;
  readonly repo: string;
  /** The vault folder in the repository. */
  readonly root: string;
  /** The configured content branch; the repository's default branch when unset. */
  readonly branch?: string;
  /** The deployment environment that means live, so its deployments are the ones listed. */
  readonly environment?: string;
}

/**
 * Claim the scope's next poll, or answer `undefined` when one ran within {@link POLL_INTERVAL_MS}, is running, or
 * GitHub's rate limit hasn't reset. Answers the branch deliveries named, when any did.
 */
async function claim({ db, scope }: Mirror, now: number): Promise<{ branch: string | null } | undefined> {
  const [, claimed] = await db.batch([
    db.prepare("INSERT OR IGNORE INTO submissions_sync (scope) VALUES (?)").bind(scope),
    db.prepare(`UPDATE submissions_sync SET lease_until = ?1
      WHERE scope = ?2 AND polled_at <= ?3 AND lease_until <= ?4 AND paused_until <= ?4 RETURNING branch`)
      .bind(now + LEASE_MS, scope, now - POLL_INTERVAL_MS, now),
  ]) as [unknown, { results: Array<{ branch: string | null }> }];
  return claimed.results[0];
}

/** End the poll: it counts as run, failed or not, so an unreachable GitHub isn't asked again at once. */
async function release({ db, scope }: Mirror, now: number): Promise<void> {
  await db.prepare("UPDATE submissions_sync SET polled_at = ?, lease_until = 0 WHERE scope = ?").bind(now, scope).run();
}

/**
 * When the scope's reads of GitHub after an answer, the poll's and status reads' alike, may resume; past when they
 * may. Both read it before each request, so a pause either stores holds the other at once, in every worker.
 */
export async function readPause({ db, scope }: Mirror): Promise<number> {
  const { results: [row] } = await db.prepare("SELECT paused_until FROM submissions_sync WHERE scope = ?").bind(scope).all<{ paused_until: number }>();
  return row?.paused_until ?? 0;
}

/** Pause the scope's reads of GitHub after an answer until `until`, unless already paused for longer. */
export async function pause({ db, scope }: Mirror, until: number): Promise<void> {
  await db.prepare(`INSERT INTO submissions_sync (scope, paused_until) VALUES (?1, ?2)
    ON CONFLICT (scope) DO UPDATE SET paused_until = MAX(paused_until, excluded.paused_until)`).bind(scope, until).run();
}

/**
 * When to ask GitHub again, if its answer says to wait, by GitHub's rules: after its `Retry-After`; after the reset
 * when the hourly allowance is at the reserve; after a minute for any other rate limit.
 */
export async function resumeAt(response: Response, now: number): Promise<number | undefined> {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (retryAfter > 0) return now + retryAfter * MS_PER_SECOND;
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining !== null && Number(remaining) <= RATE_LIMIT_RESERVE) {
    const reset = Number(response.headers.get("x-ratelimit-reset")) * MS_PER_SECOND;
    return reset > now ? reset : now + POLL_INTERVAL_MS;
  }
  return await rateLimited(response) ? now + POLL_INTERVAL_MS : undefined;
}

/** A 429, or a 403 whose message says a rate limit was exceeded, as a secondary limit's does, not that access is refused. */
async function rateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  const message = text(object(await response.clone().json().catch(() => undefined))?.message);
  return /rate limit/i.test(message ?? "");
}

/** The poll ran out of budget, or GitHub said to wait. */
class Stop extends Error {}

/** Poll when the mirror is stale; otherwise do nothing. Failures end the poll and are logged without credentials. */
export async function reconcile(target: PollTarget, token: () => Promise<string>): Promise<void> {
  const { mirror, repo, root } = target;
  const claimed = await claim(mirror, Date.now());
  if (!claimed) return;
  let requests = 0;

  /**
   * GET `path` below the repository, unless the budget is spent or the scope is paused. `conditional` sends the ETag
   * stored for it and answers `undefined` for a 304; call {@link remember} with the answer once it is stored. A 404
   * answers `null`.
   */
  async function get(path: string, conditional = false): Promise<{ body: unknown; etag: string | null } | null | undefined> {
    if (requests >= MAX_REQUESTS || await readPause(mirror) > Date.now()) throw new Stop();
    requests++;
    const [stored] = conditional
      ? (await mirror.db.prepare("SELECT etag FROM submissions_etags WHERE scope = ? AND path = ?").bind(mirror.scope, path).all<{ etag: string }>()).results
      : [];
    const response = await requestGitHub(await token(), "GET", `/repos/${repo}${path}`, undefined, undefined,
      stored ? { "if-none-match": stored.etag } : {});
    const resume = await resumeAt(response, Date.now());
    if (resume) await pause(mirror, resume);
    if (response.status === 304) return undefined;
    if (response.status === 404) return null;
    if (!response.ok) {
      if (resume) throw new Stop();
      throw new Error(`GitHub answered ${response.status} to GET ${path.split("?")[0]}`);
    }
    return { body: await response.json(), etag: conditional ? response.headers.get("etag") : null };
  }

  async function remember(path: string, etag: string | null) {
    if (!etag) return;
    await mirror.db.prepare(`INSERT INTO submissions_etags (scope, path, etag) VALUES (?1, ?2, ?3)
      ON CONFLICT (scope, path) DO UPDATE SET etag = excluded.etag`).bind(mirror.scope, path, etag).run();
  }

  /** Store a list's items, then its ETag, so a list cut short is read again in full. */
  async function sync(path: string, statements: (body: unknown) => Statement[]) {
    const answer = await get(path, true);
    if (!answer) return;
    const written = statements(answer.body);
    if (written.length > 0) await mirror.db.batch(written);
    await remember(path, answer.etag);
  }

  const query = (params: Record<string, string | number>) => `?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`;
  const whole = root === "" ? 1 : null;

  try {
    let branch = target.branch ?? claimed.branch ?? undefined;
    if (!branch) {
      branch = text(object((await get(""))?.body)?.default_branch);
      if (!branch) throw new Error("GitHub named no default branch");
      await writeBranch(mirror, branch).run();
    }

    // What decides edit status first: runs and deployments.
    await sync(`/actions/runs${query({ branch, per_page: PAGE_SIZE })}`, (body) =>
      list(object(body)?.workflow_runs).flatMap((value) => {
        const run = workflowRun(value);
        return run ? [writeRun(mirror, run)] : [];
      }));
    await sync(`/deployments${query({ ...(target.environment ? { environment: target.environment } : {}), per_page: PAGE_SIZE })}`, (body) =>
      list(body).flatMap((value) => {
        const record = deployment(value);
        return record ? [writeDeployment(mirror, record)] : [];
      }));
    await sync(`/pulls${query({ state: "all", base: branch, sort: "updated", direction: "desc", per_page: PAGE_SIZE })}`, (body) =>
      list(body).flatMap((value) => {
        const pull = pullRequest(value);
        return pull ? [writePull(mirror, pull, whole)] : [];
      }));
    await sync(`/commits${query({ sha: branch, ...(root ? { path: root } : {}), per_page: PAGE_SIZE })}`, (body) =>
      list(body).flatMap((value) => {
        const commit = listedCommit(value);
        return commit ? [writeCommit(mirror, commit)] : [];
      }));
    for (const kind of ["issue", "review"] as const) {
      await sync(`/${kind === "issue" ? "issues" : "pulls"}/comments${query({ sort: "updated", direction: "desc", per_page: PAGE_SIZE })}`, (body) =>
        list(body).flatMap((value) => {
          // Issue comments on issues rather than pull requests have no pull request to belong to.
          const number = pullNumber(kind === "issue" ? object(value)?.html_url : object(value)?.pull_request_url);
          const record = number === undefined ? undefined : comment(value, kind, number);
          return record ? [writeComment(mirror, record)] : [];
        }));
    }

    await fillDeploymentStatuses();
    await fillPullScopes();
    await fillReviews();
    await fillCommitFiles();
    await fillCreditLines();
  } catch (error) {
    if (!(error instanceof Stop)) console.warn(`[submissions] the GitHub mirror's poll stopped: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await release(mirror, Date.now());
  }

  async function rows<Row>(sql: string): Promise<Row[]> {
    return (await mirror.db.prepare(sql).bind(mirror.scope, FILL_BATCH).all<Row>()).results;
  }

  /**
   * The statuses of deployments not known to have succeeded that are still under way, or never seen with one; whose
   * latest status a delivery brought but whose earlier ones the poll hasn't read, since a lost `success` may hide
   * behind a later `inactive` or failure; and each environment's newest deployment while it stands failed, since
   * GitHub lets it succeed later and the list carries no status to say so. Read for the latest, and whether any said
   * `success`. GitHub doesn't document their order, so the latest is the highest id. Conditional, so asking again
   * about a failure nothing changed costs a 304.
   */
  async function fillDeploymentStatuses() {
    const unsettled = await rows<{ id: number }>(`SELECT id FROM submissions_deployments d
      WHERE scope = ? AND succeeded = 0 AND (state IS NULL OR state IN ('queued', 'pending', 'in_progress')
        OR status_id > statuses_read
        OR (state IN ('failure', 'error') AND NOT EXISTS (SELECT 1 FROM submissions_deployments newer
          WHERE newer.scope = d.scope AND newer.environment = d.environment AND newer.created_at > d.created_at)))
      ORDER BY created_at DESC LIMIT ?`);
    for (const { id } of unsettled) {
      await sync(`/deployments/${id}/statuses${query({ per_page: PAGE_SIZE })}`, (body) => {
        const statuses = list(body).flatMap((value) => deploymentStatus(value) ?? []);
        const status = statuses.reduce<DeploymentStatus | undefined>((latest, next) => (latest && latest.id > next.id ? latest : next), undefined);
        if (!status) return [];
        return [
          mirror.db.prepare(`UPDATE submissions_deployments SET status_id = ?, state = ?, status_url = ?, status_at = ?
            WHERE scope = ? AND id = ? AND COALESCE(status_id, 0) < ?`)
            .bind(status.id, status.state, status.url, status.createdAt, mirror.scope, id, status.id),
          mirror.db.prepare("UPDATE submissions_deployments SET statuses_read = MAX(statuses_read, ?) WHERE scope = ? AND id = ?")
            .bind(status.id, mirror.scope, id),
          ...(statuses.some(({ state }) => state === "success") ? [markSucceeded(mirror, id)] : []),
        ];
      });
    }
  }

  /**
   * Whether each pull request not yet known to touch the vault does, from its files at its head commit. Each page
   * read is kept, so a scan the budget cuts short goes on from there next poll, and "no" waits for the last page.
   */
  async function fillPullScopes() {
    const unknown = await rows<{ number: number; head_sha: string; files_read: number }>(`SELECT number, head_sha, files_read FROM submissions_pulls
      WHERE scope = ? AND in_vault IS NULL ORDER BY updated_at DESC LIMIT ?`);
    for (const { number, head_sha, files_read } of unknown) {
      for (let page = files_read + 1, done = false; !done; page++) {
        const files = list((await get(`/pulls/${number}/files${query({ per_page: PAGE_SIZE, page })}`))?.body);
        const touches = files.some((file) => [object(file)?.filename, object(file)?.previous_filename].some((path) => typeof path === "string" && inVault(path, root)));
        done = touches || files.length < PAGE_SIZE;
        await mirror.db.prepare("UPDATE submissions_pulls SET in_vault = ?, files_read = ? WHERE scope = ? AND number = ? AND head_sha = ?")
          .bind(done ? (touches ? 1 : 0) : null, page, mirror.scope, number, head_sha).run();
      }
    }
  }

  /** The reviews of pull requests in the vault updated since their reviews were last read. */
  async function fillReviews() {
    const stale = await rows<{ number: number; updated_at: string }>(`SELECT number, updated_at FROM submissions_pulls
      WHERE scope = ? AND in_vault = 1 AND (reviews_synced_at IS NULL OR reviews_synced_at < updated_at) ORDER BY updated_at DESC LIMIT ?`);
    for (const { number, updated_at } of stale) {
      const answer = await get(`/pulls/${number}/reviews${query({ per_page: PAGE_SIZE })}`);
      const written = list(answer?.body).flatMap((value) => {
        const record = review(value, number);
        return record ? [writeReview(mirror, record)] : [];
      });
      await mirror.db.batch([
        ...written,
        mirror.db.prepare("UPDATE submissions_pulls SET reviews_synced_at = ? WHERE scope = ? AND number = ?").bind(updated_at, mirror.scope, number),
      ]);
    }
  }

  /** The vault files of commits the list gave without them, and the lines a save that made one changed. */
  async function fillCommitFiles() {
    const bare = await rows<{ sha: string }>("SELECT sha FROM submissions_commits WHERE scope = ? AND files IS NULL ORDER BY committed_at DESC LIMIT ?");
    for (const { sha } of bare) {
      const answer = await get(`/commits/${sha}`);
      const changed = list(object(answer?.body)?.files);
      // A rename changed its old path too, as a push delivery lists it (removed and added).
      const files = changed.flatMap((file) =>
        [text(object(file)?.filename), text(object(file)?.previous_filename)].filter((path) => path !== undefined && inVault(path, root)));
      await mirror.db.batch([
        mirror.db.prepare("UPDATE submissions_commits SET files = ? WHERE scope = ? AND sha = ? AND files IS NULL")
          .bind(JSON.stringify(files.sort()), mirror.scope, sha),
        mirror.db.prepare(`UPDATE submissions_credits SET lines = ?1 WHERE scope = ?2 AND lines IS NULL
          AND edit_id IN (SELECT id FROM submissions_edits WHERE scope = ?2 AND commit_sha = ?3)`).bind(vaultLines(changed, root), mirror.scope, sha),
      ]);
    }
  }

  /**
   * The lines each landed save that reputation still owes changed in the vault: its direct commit's, or its pull
   * request's merge commit's, which deliveries don't carry.
   */
  async function fillCreditLines() {
    const owed = await rows<{ edit_id: string; sha: string }>(`SELECT k.edit_id, COALESCE(c.sha, p.merge_commit) AS sha
      FROM submissions_credits k JOIN submissions_edits e ON e.id = k.edit_id
        LEFT JOIN submissions_commits c ON e.kind = 'commit' AND c.scope = e.scope AND c.sha = e.commit_sha
        LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number AND p.merged_at IS NOT NULL
      WHERE k.scope = ?1 AND k.lines IS NULL AND k.new_page = 0 AND (k.state IS NULL OR k.state = 'declined')
        AND COALESCE(c.sha, p.merge_commit) IS NOT NULL
      ORDER BY e.saved_at DESC LIMIT ?2`);
    for (const { edit_id, sha } of owed) {
      const answer = await get(`/commits/${sha}`);
      // A commit GitHub no longer has, as after a force push, changed nothing that landed.
      const lines = answer === null ? 0 : vaultLines(list(object(answer?.body)?.files), root);
      await mirror.db.prepare("UPDATE submissions_credits SET lines = ? WHERE edit_id = ?").bind(lines, edit_id).run();
    }
  }
}

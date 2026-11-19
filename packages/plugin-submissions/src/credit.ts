/**
 * Reputation for saves that landed, posted to `@svartz/auth`'s ledger from the mirror. It runs after every delivery and
 * every poll, and settles each save an account made (`submissions_credits`) once the mirror shows how it ended:
 *
 * - A direct commit lands once the mirror holds the commit the site recorded for it on the content branch.
 * - A pull request lands once the pull request the site recorded for it is merged, and is declined once it is closed
 *   without merging. A declined one that is reopened and merged scores as merged too.
 *
 * Only the site's own record of a save names who earns: a commit's trailer, author and committer are whatever its
 * maker wrote, so they are never evidence, and a commit or pull request the site recorded no save for earns nobody
 * anything. A save that found its content already on the branch made no commit, so it is not recorded and earns
 * nothing; a commit scores only for the first save recorded with it.
 *
 * A landed new page scores as a page. A landed edit scores by the lines its commit (a pull request's merge commit)
 * added and removed in the vault, as GitHub's commit API counts them, which the poll reads (`fillCreditLines`): until
 * then it waits. Each event's ref names the commit or pull request, so auth records it once however often this runs.
 *
 * A save whose commit (a pull request's merge commit) a revert undid (`submissions_undone`) earns nothing: it settles
 * as a 0-point reversal, so auth never scores its ref. A revert takes back what the saves it undid earned at once
 * ({@link takeBack}), but it reads GitHub live, so it can undo a merge before the mirror learns of it, and its write
 * can fail. So credit owns the rule: every run also takes back each undone save whose reversal isn't recorded
 * (`submissions_credits.reversed`), whatever its state, and records it once auth's ledger holds it. Both sides write
 * first and check second: credit checks for the marker again as it records a settlement, and a revert reads the
 * earnings only after storing its marker. No order leaves points.
 */
import { postReputation, reverseReputation, type ReputationEvent, type Reversal } from "@svartz/auth/server";
import type { Mirror } from "./mirror";
import { integer, inVault, object, text } from "./records";

/** Saves settled per run, at most; the rest wait for the next. */
const CREDIT_BATCH = 50;

/** Settled saves whose reversal a revert couldn't write, taken back per run besides, at most. */
const REVERSAL_BATCH = 10;

interface Owed {
  id: string;
  owner: string;
  kind: "commit" | "pull-request";
  commit_sha: string | null;
  pull_number: number | null;
  new_page: number;
  lines: number | null;
  state: "declined" | null;
  /** 1 when no save was recorded with the same commit before this one. */
  first: number;
  merged_at: string | null;
  merge_commit: string | null;
  /** 1 when a revert undid the save's commit, or its pull request's merge commit. */
  undone: number;
}

/**
 * What to post for one owed save, or take back from it, and what it is settled as afterwards; `undefined` while it
 * waits on its lines. An earning names the commit it landed as, and how to take it back should a revert undo that.
 */
type Settlement = {
  event?: ReputationEvent;
  reversal?: Reversal;
  landed?: { sha: string; reversal: Reversal };
  state: "declined" | "done";
} | undefined;

/** The ref a landed save's `edit` or `page` event is posted with: its commit, or its pull request. `repo` in lower case. */
const landedRef = (repo: string, save: Pick<Owed, "kind" | "commit_sha" | "pull_number">) =>
  save.kind === "commit" ? `submissions:${repo}:commit:${save.commit_sha}` : `submissions:${repo}:pull:${save.pull_number}`;

function settle(row: Owed, repo: string): Settlement {
  const to = { account: row.owner.slice("account:".length) };
  const landed = (ref: string, sha: string): Settlement => {
    const reversal = { account: to.account, ref };
    if (row.undone) return { reversal, state: "done" };
    if (row.new_page) return { event: { kind: "page", to, ref }, landed: { sha, reversal }, state: "done" };
    return row.lines === null ? undefined : { event: { kind: "edit", to, ref, lines: row.lines }, landed: { sha, reversal }, state: "done" };
  };
  if (row.kind === "commit") return row.first ? landed(landedRef(repo, row), row.commit_sha!) : { state: "done" };
  const pull = landedRef(repo, row);
  if (row.merged_at && row.merge_commit) return landed(pull, row.merge_commit);
  return { event: { kind: "declined", to, ref: `${pull}:declined` }, state: "declined" };
}

/**
 * Post what the mirror shows landed or was declined, and take back what undone saves earned, then mark each save
 * settled. `env` holds auth's `SVARTZ_DB`. One query reads both kinds, and one more per save records it.
 */
export async function credit(mirror: Mirror, repo: string, env: Readonly<Record<string, unknown>>): Promise<void> {
  const { db, scope } = mirror;
  const { results } = await db.prepare(`WITH picked (id) AS (
      SELECT edit_id FROM (SELECT k.edit_id FROM submissions_credits k JOIN submissions_edits e ON e.id = k.edit_id
          LEFT JOIN submissions_commits c ON e.kind = 'commit' AND c.scope = e.scope AND c.sha = e.commit_sha
          LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number
        WHERE k.scope = ?1 AND e.owner LIKE 'account:%' AND (
          (k.state IS NULL AND (c.sha IS NOT NULL OR p.state = 'closed'))
          OR (k.state = 'declined' AND p.merged_at IS NOT NULL))
        LIMIT ?2)
      UNION
      -- Undone saves whose reversal isn't recorded, whatever their state: a revert whose own take-back failed.
      SELECT edit_id FROM (SELECT k.edit_id FROM submissions_undone u
          LEFT JOIN submissions_pulls p ON p.scope = u.scope AND p.merge_commit = u.sha
          JOIN submissions_edits e ON e.scope = u.scope
            AND ((e.kind = 'commit' AND e.commit_sha = u.sha) OR (e.kind = 'pull-request' AND e.pull_number = p.number))
          JOIN submissions_credits k ON k.edit_id = e.id
        WHERE u.scope = ?1 AND k.reversed = 0 AND e.owner LIKE 'account:%'
        LIMIT ?3)
    )
    SELECT e.id, e.owner, e.kind, e.commit_sha, e.pull_number, k.new_page, k.lines, k.state, p.merged_at, p.merge_commit,
      NOT EXISTS (SELECT 1 FROM submissions_edits o WHERE o.scope = e.scope AND o.kind = 'commit' AND o.commit_sha = e.commit_sha
        AND (o.saved_at < e.saved_at OR (o.saved_at = e.saved_at AND o.id < e.id))) AS first,
      EXISTS (SELECT 1 FROM submissions_undone u WHERE u.scope = e.scope
        AND u.sha = CASE e.kind WHEN 'commit' THEN e.commit_sha ELSE p.merge_commit END) AS undone
    FROM picked JOIN submissions_credits k ON k.edit_id = picked.id JOIN submissions_edits e ON e.id = k.edit_id
      LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number`)
    .bind(scope, CREDIT_BATCH, REVERSAL_BATCH).all<Owed>();
  for (const row of results) {
    const settlement = settle(row, repo.toLowerCase());
    if (!settlement) continue;
    if (settlement.event) await postReputation(env, settlement.event);
    if (settlement.reversal) await reverseReputation(env, [settlement.reversal]);
    // Recorded first and checked second: a revert may have stored that it undid the commit since the read above, and
    // read what it earned before this post. Then its earning is taken back here; should that fail, the next run does.
    const { results: [recorded] } = await db.prepare(`UPDATE submissions_credits SET state = ?1, reversed = MAX(reversed, ?3)
        WHERE edit_id = ?2
        RETURNING reversed = 0 AND EXISTS (SELECT 1 FROM submissions_undone WHERE scope = ?4 AND sha = ?5) AS owed`)
      .bind(settlement.state, row.id, row.undone, scope, settlement.landed?.sha ?? null).all<{ owed: number }>();
    if (!recorded?.owed || !settlement.landed) continue;
    await reverseReputation(env, [settlement.landed.reversal]);
    await db.prepare("UPDATE submissions_credits SET reversed = 1 WHERE edit_id = ?").bind(row.id).run();
  }
}

/**
 * Take back what landing `commits` earned (see {@link earnings}), then record each reversal so {@link credit} needn't
 * write it again. Throws when either write fails; credit then takes those saves back on its next run, as long as
 * `commits` are stored as undone. Two D1 calls besides auth's.
 */
export async function takeBack(mirror: Mirror, repo: string, env: Readonly<Record<string, unknown>>, commits: readonly string[]): Promise<void> {
  const earned = await earnings(mirror, repo, commits);
  if (earned.length === 0) return;
  await reverseReputation(env, earned.map(({ account, ref }) => ({ account, ref })));
  await mirror.db.prepare("UPDATE submissions_credits SET reversed = 1 WHERE edit_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(earned.map(({ id }) => id))).run();
}

/**
 * What landing `commits` (SHAs on the content branch) earns or will earn: for each, the save the site recorded making
 * it (a direct commit, or the merge of a pull request it opened), the earliest when there are several, as
 * `MADE_BY_SITE` in `commits.ts` names it. Only a save an account made that reputation owes: an unrecorded commit, a
 * guest's save or a revert's earns nothing. Each comes with its save's id, its account and the ref its event is
 * posted with, for auth's `reverseReputation`. One query.
 */
async function earnings({ db, scope }: Mirror, repo: string, commits: readonly string[]): Promise<Array<{ id: string; account: string; ref: string }>> {
  if (commits.length === 0) return [];
  const { results } = await db.prepare(`SELECT sha, id, owner, kind, commit_sha, pull_number, credited FROM (
      SELECT e.commit_sha AS sha, e.owner, e.kind, e.commit_sha, e.pull_number, e.saved_at, e.id,
        EXISTS (SELECT 1 FROM submissions_credits k WHERE k.edit_id = e.id) AS credited
      FROM submissions_edits e WHERE e.scope = ?1 AND e.kind = 'commit' AND e.commit_sha IN (SELECT value FROM json_each(?2))
      UNION ALL
      SELECT p.merge_commit, e.owner, e.kind, e.commit_sha, e.pull_number, e.saved_at, e.id,
        EXISTS (SELECT 1 FROM submissions_credits k WHERE k.edit_id = e.id)
      FROM submissions_edits e JOIN submissions_pulls p ON p.scope = e.scope AND p.number = e.pull_number
      WHERE e.scope = ?1 AND e.kind = 'pull-request' AND p.merged_at IS NOT NULL AND p.merge_commit IN (SELECT value FROM json_each(?2))
    ) ORDER BY saved_at, id`).bind(scope, JSON.stringify(commits))
    .all<Pick<Owed, "id" | "kind" | "commit_sha" | "pull_number"> & { sha: string; owner: string | null; credited: number }>();
  const first = new Map<string, (typeof results)[number]>();
  for (const row of results) if (!first.has(row.sha)) first.set(row.sha, row);
  const lower = repo.toLowerCase();
  return [...first.values()].flatMap((save) => save.credited && save.owner?.startsWith("account:")
    ? [{ id: save.id, account: save.owner.slice("account:".length), ref: landedRef(lower, save) }]
    : []);
}

/** The lines a commit's `files`, as GitHub's commit API lists them, added and removed inside the vault folder `root`. */
export function vaultLines(files: readonly unknown[], root: string): number {
  let lines = 0;
  for (const file of files) {
    const entry = object(file);
    const path = text(entry?.filename);
    if (path === undefined || !inVault(path, root)) continue;
    lines += (integer(entry?.additions) ?? 0) + (integer(entry?.deletions) ?? 0);
  }
  return lines;
}

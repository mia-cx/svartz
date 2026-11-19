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
 */
import { postReputation, type ReputationEvent } from "@svartz/auth/server";
import type { Mirror } from "./mirror";
import { integer, inVault, object, text } from "./records";

/** Saves settled per run, at most; the rest wait for the next. */
const CREDIT_BATCH = 50;

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
}

/** What to post for one owed save, and what it is settled as afterwards; `undefined` while it waits on its lines. */
type Settlement = { event?: ReputationEvent; state: "declined" | "done" } | undefined;

function settle(row: Owed, repo: string): Settlement {
  const to = { account: row.owner.slice("account:".length) };
  const landed = (ref: string): Settlement => {
    if (row.new_page) return { event: { kind: "page", to, ref }, state: "done" };
    return row.lines === null ? undefined : { event: { kind: "edit", to, ref, lines: row.lines }, state: "done" };
  };
  if (row.kind === "commit") return row.first ? landed(`submissions:${repo}:commit:${row.commit_sha}`) : { state: "done" };
  const pull = `submissions:${repo}:pull:${row.pull_number}`;
  if (row.merged_at && row.merge_commit) return landed(pull);
  return { event: { kind: "declined", to, ref: `${pull}:declined` }, state: "declined" };
}

/** Post what the mirror shows landed or was declined, then mark each save settled. `env` holds auth's `SVARTZ_DB`. */
export async function credit(mirror: Mirror, repo: string, env: Readonly<Record<string, unknown>>): Promise<void> {
  const { db, scope } = mirror;
  const { results } = await db.prepare(`SELECT e.id, e.owner, e.kind, e.commit_sha, e.pull_number, k.new_page, k.lines, k.state,
      p.merged_at, p.merge_commit,
      NOT EXISTS (SELECT 1 FROM submissions_edits o WHERE o.scope = e.scope AND o.kind = 'commit' AND o.commit_sha = e.commit_sha
        AND (o.saved_at < e.saved_at OR (o.saved_at = e.saved_at AND o.id < e.id))) AS first
    FROM submissions_credits k JOIN submissions_edits e ON e.id = k.edit_id
      LEFT JOIN submissions_commits c ON e.kind = 'commit' AND c.scope = e.scope AND c.sha = e.commit_sha
      LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number
    WHERE k.scope = ?1 AND e.owner LIKE 'account:%' AND (
      (k.state IS NULL AND (c.sha IS NOT NULL OR p.state = 'closed'))
      OR (k.state = 'declined' AND p.merged_at IS NOT NULL))
    LIMIT ?2`).bind(scope, CREDIT_BATCH).all<Owed>();
  for (const row of results) {
    const settlement = settle(row, repo.toLowerCase());
    if (!settlement) continue;
    if (settlement.event) await postReputation(env, settlement.event);
    await db.prepare("UPDATE submissions_credits SET state = ? WHERE edit_id = ?").bind(settlement.state, row.id).run();
  }
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

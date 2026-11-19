/**
 * Reputation for saves that landed, posted to `@svartz/auth`'s ledger from the mirror. It runs after every delivery and
 * every poll, and settles each save an account made (`submissions_credits`) once the mirror shows how it ended:
 *
 * - A direct commit lands once the mirror holds it on the content branch. It scores only when its `Svartz-Account`
 *   trailer names the save's account and the App's bot committed it: a save that found its content already on the
 *   branch is recorded with someone else's commit, and a commit made outside the site can carry any trailer.
 * - A pull request lands once merged, and is declined once closed without merging. A declined one that is reopened
 *   and merged scores as merged too.
 *
 * A landed new page scores as a page. A landed edit scores by the lines its commit (a pull request's merge commit)
 * added and removed in the vault, as GitHub's commit API counts them, which the poll reads (`fillCreditLines`): until
 * then it waits. Each event's ref names the commit or pull request, so auth records it once however often this runs.
 */
import { postReputation, type ReputationEvent } from "@svartz/auth/server";
import type { Person } from "./github";
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
  trailer_account: string | null;
  committer_email: string | null;
  merged_at: string | null;
  merge_commit: string | null;
}

/** What to post for one owed save, and what it is settled as afterwards; `undefined` while it waits on its lines. */
type Settlement = { event?: ReputationEvent; state: "declined" | "done" } | undefined;

function settle(row: Owed, repo: string, bot: string): Settlement {
  const to = { account: row.owner.slice("account:".length) };
  const landed = (ref: string): Settlement => {
    if (row.new_page) return { event: { kind: "page", to, ref }, state: "done" };
    return row.lines === null ? undefined : { event: { kind: "edit", to, ref, lines: row.lines }, state: "done" };
  };
  if (row.kind === "commit") {
    const trusted = row.trailer_account === to.account && row.committer_email === bot;
    return trusted ? landed(`submissions:${repo}:commit:${row.commit_sha}`) : { state: "done" };
  }
  const pull = `submissions:${repo}:pull:${row.pull_number}`;
  if (row.merged_at && row.merge_commit) return landed(pull);
  return { event: { kind: "declined", to, ref: `${pull}:declined` }, state: "declined" };
}

/**
 * Post what the mirror shows landed or was declined, then mark each save settled. `bot` is the App's bot user, who
 * commits every direct commit the site makes; `env` holds auth's `SVARTZ_DB`.
 */
export async function credit(mirror: Mirror, repo: string, bot: (() => Promise<Person>) | undefined, env: Readonly<Record<string, unknown>>): Promise<void> {
  const { db, scope } = mirror;
  const { results } = await db.prepare(`SELECT e.id, e.owner, e.kind, e.commit_sha, e.pull_number, k.new_page, k.lines, k.state,
      c.trailer_account, c.committer_email, p.merged_at, p.merge_commit
    FROM submissions_credits k JOIN submissions_edits e ON e.id = k.edit_id
      LEFT JOIN submissions_commits c ON e.kind = 'commit' AND c.scope = e.scope AND c.sha = e.commit_sha
      LEFT JOIN submissions_pulls p ON e.kind = 'pull-request' AND p.scope = e.scope AND p.number = e.pull_number
    WHERE k.scope = ?1 AND e.owner LIKE 'account:%' AND (
      (k.state IS NULL AND (c.sha IS NOT NULL OR p.state = 'closed'))
      OR (k.state = 'declined' AND p.merged_at IS NOT NULL))
    LIMIT ?2`).bind(scope, CREDIT_BATCH).all<Owed>();
  if (results.length === 0) return;
  // Only direct commits need the bot, and only an App commits.
  const email = results.some(({ kind }) => kind === "commit") && bot ? (await bot()).email : "";
  for (const row of results) {
    const settlement = settle(row, repo.toLowerCase(), email);
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

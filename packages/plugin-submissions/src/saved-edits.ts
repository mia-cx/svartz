/**
 * Who made an edit, by the site's own record of saving it, and which vault files a commit changed, for the moderation
 * plugin's Reports panel. A commit's author, committer and `Svartz-Account` trailer are git metadata anyone can forge,
 * so only `submissions_edits` names an account here.
 */
import type { ServerContext } from "@svartz/core";
import { isDatabase, migrate, scopeOf } from "./mirror";
import type { VaultRecords } from "./server";

/** The edits a vault's site saved among those asked about, each with the id of the account that saved it, or `null`. */
export interface SavedEdits {
  /** Direct commits, by SHA. */
  readonly commits: ReadonlyMap<string, string | null>;
  /** Pull requests, by number: each one is this vault's submission, which `POST close/` takes. */
  readonly pulls: ReadonlyMap<number, string | null>;
}

const OWNER_ACCOUNT = "account:";

/**
 * Which of `commits` (SHAs) and `pulls` (numbers) the site saved for the vault `records` describes, and the account
 * behind each: whoever made the commit, or opened the pull request with its first save. `null` for a save by someone
 * without an account. In one query; none are saved when the binding is missing.
 */
export async function savedEdits(
  env: ServerContext["env"], { database, repo, root }: VaultRecords, { commits = [], pulls = [] }: { commits?: readonly string[]; pulls?: readonly number[] },
): Promise<SavedEdits> {
  const db = env[database];
  const found = { commits: new Map<string, string | null>(), pulls: new Map<number, string | null>() };
  if (!isDatabase(db) || commits.length + pulls.length === 0) return found;
  await migrate(db);
  const { results } = await db.prepare(`SELECT kind, commit_sha, pull_number, owner FROM submissions_edits
    WHERE scope = ?1 AND ((kind = 'commit' AND commit_sha IN (SELECT value FROM json_each(?2)))
      OR (kind = 'pull-request' AND pull_number IN (SELECT value FROM json_each(?3))))
    ORDER BY saved_at, id`)
    .bind(scopeOf(repo, root), JSON.stringify(commits), JSON.stringify(pulls))
    .all<{ kind: "commit" | "pull-request"; commit_sha: string | null; pull_number: number | null; owner: string | null }>();
  for (const row of results) {
    const account = row.owner?.startsWith(OWNER_ACCOUNT) ? row.owner.slice(OWNER_ACCOUNT.length) : null;
    // The first save is the one that made the commit or opened the pull request.
    if (row.kind === "commit" && !found.commits.has(row.commit_sha!)) found.commits.set(row.commit_sha!, account);
    if (row.kind === "pull-request" && !found.pulls.has(row.pull_number!)) found.pulls.set(row.pull_number!, account);
  }
  return found;
}

/**
 * The vault files each of `commits` (SHAs) changed, as vault paths, for those the mirror of the vault `records`
 * describes holds with their files. In one query; none when the binding is missing.
 */
export async function changedFiles(
  env: ServerContext["env"], { database, repo, root }: VaultRecords, commits: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const db = env[database];
  if (!isDatabase(db) || commits.length === 0) return new Map();
  await migrate(db);
  const { results } = await db.prepare(`SELECT sha, files FROM submissions_commits
    WHERE scope = ?1 AND files IS NOT NULL AND sha IN (SELECT value FROM json_each(?2))`)
    .bind(scopeOf(repo, root), JSON.stringify(commits)).all<{ sha: string; files: string }>();
  const vaultPath = (path: string) => (root ? path.slice(root.length + 1) : path);
  return new Map(results.map(({ sha, files }) => [sha, (JSON.parse(files) as string[]).map(vaultPath)]));
}

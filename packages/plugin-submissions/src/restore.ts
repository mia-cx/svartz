/**
 * `@svartz/plugin-submissions/restore`: commit a page's earlier content back to the content branch as an account, the
 * way a save commits (`commitSubmission`): authored as the account with its GitHub account as co-author, committed by
 * the App's bot, with the save's trailers, and never over a file that changed since the caller read it. A branch whose
 * rules refuse the commit is never sent a pull request instead. The commit is recorded as the account's save, which
 * history and contributions show as theirs, and which reputation owes nothing: the content is someone else's work.
 * Page history's revert (`@svartz/plugin-history`) uses it.
 *
 * It also answers what the saves a restore undoes earned ({@link Restorer.earnings}), as auth's `reverseReputation`
 * takes it, and which pages restored content claims ({@link Restorer.claims}), as a save's commit checks them.
 */
import { linkedIdentities, type Account } from "@svartz/auth/server";
import type { ServerContext } from "@svartz/core";
import { appCommitter } from "./app";
import { routeClaims, type RouteClaims } from "./claims";
import { CommitsUnavailable, sourceToken, type CommitSource } from "./commits";
import { earnings } from "./credit";
import { SubmissionError } from "./errors";
import { blobSha, commitSubmission, type Attribution, type CommitResult, type Person } from "./github";
import { isDatabase, migrate, recordEdit, scopeOf, type Mirror } from "./mirror";

export type { RouteClaims } from "./claims";

/** The account a commit is authored as, with its linked GitHub account as co-author, and the App's bot that commits it. */
export async function commitAttribution(account: Account, committer: Person, request: Request, context: ServerContext): Promise<Attribution> {
  const github = (await linkedIdentities(account, context.env)).find(({ provider }) => provider === "github");
  return {
    accountId: account.id,
    name: account.name,
    handle: account.handle,
    host: new URL(request.url).hostname,
    committer,
    ...(github ? { github } : {}),
  };
}

/** One page's content to commit back. */
export interface Restore {
  /** Who commits it, as `readSignIn` answered. */
  readonly account: Account;
  /** The request asking, whose host names the author's address. */
  readonly request: Request;
  /** The page: its route below the deployment base, as saves record it, and its vault path. */
  readonly page: { readonly href: string; readonly path: string };
  readonly markdown: string;
  /** The file as the caller read it on the branch: the commit refuses unless the branch still holds it. */
  readonly current: string;
  /** The commit's title. */
  readonly title: string;
  /** The paragraph after the title, which history shows as the change's summary. */
  readonly note: string;
  /** Runs once the commit exists and before the branch moves to it: where the caller records the commit it makes. */
  readonly beforeMove: (commit: { readonly sha: string; readonly url: string }) => Promise<void>;
}

/**
 * What {@link Restorer.restore} did: committed, or why not. `unchanged` when the branch already held the content,
 * `changed` when its file isn't the one the caller read, `protected` when a rule for the branch refuses the commit,
 * `busy` when the branch moved on meanwhile. Only `commit` moved the branch.
 */
export type Restored =
  | { readonly kind: "commit"; readonly sha: string; readonly url: string }
  | { readonly kind: "unchanged" | "changed" | "protected" | "busy" };

/** Commits for one request. Make one per request with {@link restorer}. */
export interface Restorer {
  /** The pages `markdown` at `vaultPath` claims, as permissions name them, when it publishes as page `self` now. */
  claims(vaultPath: string, markdown: string, self: string): ReadonlySet<string> | undefined;
  /**
   * What landing `commits` earned or will earn: the account behind each save the site recorded making one, and the
   * ref its reputation is posted with. Commits the site didn't make, and saves that earn nothing, aren't listed.
   */
  earnings(commits: readonly string[]): Promise<Array<{ readonly account: string; readonly ref: string }>>;
  /**
   * Commit `restore.markdown` at its page's path as `restore.account`, then record it as their save. GitHub failing
   * throws {@link CommitsUnavailable}; anything `beforeMove` throws propagates, and nothing moves. A failed record is
   * logged: the commit stands.
   */
  restore(restore: Restore): Promise<Restored>;
}

/**
 * Restores a vault's pages. Only a GitHub App commits as an account, so with a token `commits` is false and every
 * restore throws. `token` shares a {@link sourceToken} with the vault's commit reader.
 */
export function restorer(source: CommitSource, claimed: RouteClaims, token = sourceToken(source)) {
  const { repo, root, credentials } = source;
  const committer = credentials.app ? appCommitter(repo, credentials.app, token) : undefined;
  const claims = routeClaims(claimed);
  const repoPath = (path: string) => (root ? `${root}/${path}` : path);

  async function mirrorFor(context: ServerContext): Promise<Mirror> {
    const db = context.env[source.database.env];
    if (!isDatabase(db)) throw new CommitsUnavailable(`no D1 database is bound as ${source.database.env}`);
    await migrate(db);
    return { db, scope: scopeOf(repo, root) };
  }

  return {
    commits: committer !== undefined,
    forRequest: (context: ServerContext): Restorer => ({
      claims,

      async earnings(commits) {
        return earnings(await mirrorFor(context), repo, commits);
      },

      async restore({ account, request, page, markdown, current, title, note, beforeMove }) {
        if (!committer) throw new CommitsUnavailable("only a GitHub App commits as an account");
        const path = repoPath(page.path);
        const id = crypto.randomUUID().replaceAll("-", "");
        let committed: CommitResult;
        try {
          const by = await commitAttribution(account, await committer(context.env), request, context);
          committed = await commitSubmission(
            { repo, token: await token(context.env), ...(source.branch ? { branch: source.branch } : {}) },
            { kind: "edit", id, path, page: page.href, pageUrl: new URL(page.href, request.url).href, markdown, note, title, submitter: account.identity },
            await blobSha(current),
            by,
            { beforeMove },
          );
        } catch (error) {
          if (!(error instanceof SubmissionError)) throw error;
          if (error.code === "branch_busy") return { kind: "busy" };
          if (error.code === "unchanged") return { kind: "unchanged" };
          throw new CommitsUnavailable(error.message);
        }
        if (committed.kind === "review") return { kind: committed.reason };
        if (!committed.made) return { kind: "unchanged" };
        const { sha, url } = committed;
        await mirrorFor(context).then((mirror) => recordEdit(mirror, {
          id,
          owner: `account:${account.id}`,
          kind: "commit",
          page: page.href,
          path,
          commit: sha,
          pull: null,
          url,
          savedAt: new Date().toISOString(),
          newPage: false,
          earns: false,
        })).catch((error: unknown) => {
          // The commit landed: only the account's name on it is lost, and history shows its git author instead.
          console.error(`[submissions] restored ${path} as ${sha} but couldn't record it as the account's save`, error);
        });
        return { kind: "commit", sha, url };
      },
    }),
  };
}

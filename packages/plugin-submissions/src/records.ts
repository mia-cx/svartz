/**
 * GitHub's objects as the mirror keeps them. Webhook payloads and REST answers share these shapes, so the webhook and
 * the reconcile poll read them through the same functions. Each answers `undefined` for an object missing a field the
 * mirror needs; GitHub's text stays as GitHub sent it, for whoever shows it to escape.
 */
import { ACCOUNT_TRAILER } from "./github";

type Json = Readonly<Record<string, unknown>>;

export const object = (value: unknown): Json | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : undefined;
export const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
export const integer = (value: unknown): number | undefined => (Number.isSafeInteger(value) ? value as number : undefined);
export const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/**
 * A GitHub time as one canonical ISO 8601 string, so stored times compare as text: push payloads give offsets such as
 * `+01:00`, the REST API gives `Z`.
 */
export function time(value: unknown): string | undefined {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

const login = (user: unknown) => text(object(user)?.login) ?? null;

/** Whether `path`, a repository path, is inside the vault folder `root` (`""` is the repository's root). */
export const inVault = (path: string, root: string) => root === "" || path.startsWith(`${root}/`);

/** A commit on the content branch that touches the vault. */
export interface CommitRecord {
  readonly sha: string;
  readonly message: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorLogin: string | null;
  readonly committerEmail: string;
  /**
   * The account its {@link ACCOUNT_TRAILER} trailer names: a claim, never proof. Whoever writes a commit writes its
   * trailers and its committer too; only `submissions_edits` says which account made a commit.
   */
  readonly trailerAccount: string | null;
  readonly committedAt: string;
  readonly url: string;
  /** Its changed files inside the vault, as repository paths; `null` until the poll reads them. */
  readonly files: readonly string[] | null;
}

const TRAILER = new RegExp(`^${ACCOUNT_TRAILER}: (\\S+)$`, "m");

/** The account a commit message's last paragraph names, where its trailers are. */
function trailerAccount(message: string): string | null {
  const paragraphs = message.trimEnd().split(/\n\s*\n/);
  return paragraphs.length > 1 ? paragraphs.at(-1)!.match(TRAILER)?.[1] ?? null : null;
}

/** A pushed commit, from a `push` delivery's `commits`; `undefined` when it changed nothing in the vault. */
export function pushedCommit(value: unknown, root: string): CommitRecord | undefined {
  const commit = object(value);
  const sha = text(commit?.id);
  const message = text(commit?.message);
  const author = object(commit?.author);
  const committedAt = time(commit?.timestamp);
  const url = text(commit?.url);
  if (!commit || !sha || message === undefined || !author || !committedAt || !url) return undefined;
  const changed = ["added", "removed", "modified"].flatMap((key) => list(commit[key])).filter((path) => typeof path === "string");
  const files = [...new Set(changed)].filter((path) => inVault(path, root)).sort();
  if (files.length === 0) return undefined;
  return {
    sha,
    message,
    authorName: text(author.name) ?? "",
    authorEmail: text(author.email) ?? "",
    authorLogin: text(author.username) ?? null,
    committerEmail: text(object(commit.committer)?.email) ?? "",
    trailerAccount: trailerAccount(message),
    committedAt,
    url,
    files,
  };
}

/**
 * A commit as the REST API lists it (`GET /commits`), already filtered to the vault by its `path` query. Its files
 * aren't listed: `files` is `null` until a later poll reads the commit.
 */
export function listedCommit(value: unknown): CommitRecord | undefined {
  const entry = object(value);
  const commit = object(entry?.commit);
  const sha = text(entry?.sha);
  const message = text(commit?.message);
  const author = object(commit?.author);
  const committedAt = time(author?.date);
  const url = text(entry?.html_url);
  if (!sha || message === undefined || !author || !committedAt || !url) return undefined;
  return {
    sha,
    message,
    authorName: text(author.name) ?? "",
    authorEmail: text(author.email) ?? "",
    authorLogin: login(entry?.author),
    committerEmail: text(object(commit?.committer)?.email) ?? "",
    trailerAccount: trailerAccount(message),
    committedAt,
    url,
    files: null,
  };
}

/** A pull request targeting the content branch. */
export interface PullRecord {
  readonly number: number;
  readonly state: "open" | "closed";
  readonly title: string;
  readonly author: string | null;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  readonly mergedAt: string | null;
  /** The commit that put it on the branch, once merged. Before that, GitHub's value names a test merge, so it's left out. */
  readonly mergeCommit: string | null;
}

export function pullRequest(value: unknown): PullRecord | undefined {
  const pull = object(value);
  const number = integer(pull?.number);
  const state = pull?.state;
  const head = object(pull?.head);
  const base = object(pull?.base);
  const headRef = text(head?.ref);
  const headSha = text(head?.sha);
  const baseRef = text(base?.ref);
  const url = text(pull?.html_url);
  const createdAt = time(pull?.created_at);
  const updatedAt = time(pull?.updated_at);
  if (number === undefined || (state !== "open" && state !== "closed") || !headRef || !headSha || !baseRef || !url || !createdAt || !updatedAt) {
    return undefined;
  }
  const mergedAt = time(pull?.merged_at) ?? null;
  return {
    number,
    state,
    title: text(pull?.title) ?? "",
    author: login(pull?.user),
    headRef,
    headSha,
    baseRef,
    url,
    createdAt,
    updatedAt,
    closedAt: time(pull?.closed_at) ?? null,
    mergedAt,
    mergeCommit: mergedAt ? text(pull?.merge_commit_sha) ?? null : null,
  };
}

/** A review on a pull request. `state` is lowercase: webhooks send `approved`, the REST API `APPROVED`. */
export interface ReviewRecord {
  readonly id: number;
  readonly pull: number;
  readonly state: string;
  readonly author: string | null;
  readonly body: string;
  readonly commit: string | null;
  readonly url: string;
  readonly submittedAt: string | null;
}

export function review(value: unknown, pull: number): ReviewRecord | undefined {
  const entry = object(value);
  const id = integer(entry?.id);
  const state = text(entry?.state)?.toLowerCase();
  const url = text(entry?.html_url);
  if (id === undefined || !state || !url) return undefined;
  return {
    id,
    pull,
    state,
    author: login(entry?.user),
    body: text(entry?.body) ?? "",
    commit: text(entry?.commit_id) ?? null,
    url,
    submittedAt: time(entry?.submitted_at) ?? null,
  };
}

/** A comment on a pull request: `issue` on its conversation, `review` on a line of its diff. */
export interface CommentRecord {
  readonly kind: "issue" | "review";
  readonly id: number;
  readonly pull: number;
  readonly author: string | null;
  /** Empty once deleted. */
  readonly body: string;
  readonly path: string | null;
  readonly line: number | null;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deleted: boolean;
}

export function comment(value: unknown, kind: CommentRecord["kind"], pull: number, deleted = false): CommentRecord | undefined {
  const entry = object(value);
  const id = integer(entry?.id);
  const url = text(entry?.html_url);
  const createdAt = time(entry?.created_at);
  const updatedAt = time(entry?.updated_at);
  if (id === undefined || !url || !createdAt || !updatedAt) return undefined;
  return {
    kind,
    id,
    pull,
    author: login(entry?.user),
    body: deleted ? "" : text(entry?.body) ?? "",
    path: text(entry?.path) ?? null,
    line: integer(entry?.line) ?? null,
    url,
    createdAt,
    updatedAt,
    deleted,
  };
}

/** The pull request number an `…/pull/42` or `…/pulls/42` URL names. */
export function pullNumber(url: unknown): number | undefined {
  const match = text(url)?.match(/\/pulls?\/(\d+)(?:[#/?]|$)/);
  return match ? Number(match[1]) : undefined;
}

/** How far a run has got: queued and its kin, then in progress, then completed. Never goes back within one attempt. */
const RUN_PROGRESS: Readonly<Record<string, number>> = { in_progress: 1, completed: 2 };

/** A GitHub Actions workflow run. */
export interface RunRecord {
  readonly id: number;
  /** The workflow file, such as `.github/workflows/deploy.yml`. */
  readonly workflowPath: string;
  readonly name: string;
  readonly headSha: string;
  readonly headBranch: string | null;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly progress: number;
  readonly attempt: number;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function workflowRun(value: unknown): RunRecord | undefined {
  const run = object(value);
  const id = integer(run?.id);
  const workflowPath = text(run?.path);
  const headSha = text(run?.head_sha);
  const status = text(run?.status);
  const url = text(run?.html_url);
  const createdAt = time(run?.created_at);
  const updatedAt = time(run?.updated_at);
  if (id === undefined || !workflowPath || !headSha || !status || !url || !createdAt || !updatedAt) return undefined;
  return {
    id,
    // A reusable workflow's path may end in `@<ref>`.
    workflowPath: workflowPath.replace(/@.*$/, ""),
    name: text(run?.name) ?? "",
    headSha,
    headBranch: text(run?.head_branch) ?? null,
    event: text(run?.event) ?? "",
    status,
    conclusion: text(run?.conclusion) ?? null,
    progress: RUN_PROGRESS[status] ?? 0,
    attempt: integer(run?.run_attempt) ?? 1,
    url,
    createdAt,
    updatedAt,
  };
}

/** A deployment, and its latest status once one is known. */
export interface DeploymentRecord {
  readonly id: number;
  readonly sha: string;
  readonly ref: string;
  readonly environment: string;
  readonly createdAt: string;
  readonly status: DeploymentStatus | null;
}

export interface DeploymentStatus {
  /** GitHub numbers statuses in the order they are made; a later status has a higher id. */
  readonly id: number;
  readonly state: string;
  readonly url: string | null;
  readonly createdAt: string;
}

export function deployment(value: unknown, status: unknown = undefined): DeploymentRecord | undefined {
  const entry = object(value);
  const id = integer(entry?.id);
  const sha = text(entry?.sha);
  const environment = text(entry?.environment);
  const createdAt = time(entry?.created_at);
  if (id === undefined || !sha || !environment || !createdAt) return undefined;
  return { id, sha, ref: text(entry?.ref) ?? "", environment, createdAt, status: deploymentStatus(status) ?? null };
}

export function deploymentStatus(value: unknown): DeploymentStatus | undefined {
  const entry = object(value);
  const id = integer(entry?.id);
  const state = text(entry?.state);
  const createdAt = time(entry?.created_at);
  if (id === undefined || !state || !createdAt) return undefined;
  return { id, state, url: text(entry?.log_url) || text(entry?.target_url) || null, createdAt };
}

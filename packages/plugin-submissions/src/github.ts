/**
 * The PR writer: reads a note's source at the build commit and opens a submission as a pull request through
 * GitHub's REST and Git Data APIs. Uses `fetch` only, so it runs on Workers and Node alike.
 */
import type { EditResponse } from "./api";
import { SubmissionError } from "./errors";

const API = "https://api.github.com";
const MAX_BRANCH_SLUG = 48;
/** Past this, a GitHub request counts as unanswered and the reader is told to try again. */
export const GITHUB_TIMEOUT_MS = 10_000;

/** The repository and credentials a submission is written with. */
export interface GitHubTarget {
  /** `owner/name`. */
  readonly repo: string;
  readonly token: string;
  /** The branch pull requests target; the repository's default branch when unset. */
  readonly branch?: string;
  readonly labels: readonly string[];
  /** The commit the site was built from. Edits branch from it, so a page changed since conflicts. */
  readonly commit: string;
}

/** One reader's edit of a published note. `kind` leaves room for new pages. */
export interface Submission {
  readonly kind: "edit";
  /** The editor's id for this edit, the same on every retry; names the branch. */
  readonly id: string;
  /** Repository-relative path of the note. */
  readonly path: string;
  /** The page's URL route, such as `/guides/setup/`; names the branch. */
  readonly page: string;
  /** Absolute URL of the page, for the pull request body. */
  readonly pageUrl: string;
  readonly markdown: string;
  readonly note: string;
}

interface PullRequest {
  readonly html_url: string;
  readonly number: number;
}

const unavailable = () =>
  new SubmissionError("github_unavailable", 503, "Couldn't reach GitHub right now. Try again in a moment.");

/**
 * One GitHub request, its body read in full within {@link GITHUB_TIMEOUT_MS}. No answer in time, or none at all,
 * throws `github_unavailable`; whether GitHub acted on the request is then unknown.
 */
async function send(target: GitHubTarget, method: string, path: string, body?: unknown, accept = "application/vnd.github+json") {
  try {
    const response = await fetch(`${API}/repos/${target.repo}${path}`, {
      method,
      headers: {
        accept,
        authorization: `Bearer ${target.token}`,
        "user-agent": "svartz-submissions",
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    // Buffered under the same deadline, so a body that stalls counts as no answer too.
    return new Response(response.body === null ? null : await response.arrayBuffer(), response);
  } catch {
    throw unavailable();
  }
}

/** The reader-facing error for a GitHub response that failed. */
async function failure(target: GitHubTarget, response: Response): Promise<SubmissionError> {
  const detail = await response.json().then((body: { message?: unknown }) => body?.message, () => undefined);
  switch (response.status) {
    case 401:
      return new SubmissionError("github_unauthorized", 502, "GitHub rejected this site's token. Ask the site owner to renew it.");
    case 403:
    case 404:
      return new SubmissionError(
        "github_forbidden",
        502,
        `GitHub won't let this site write to ${target.repo}. Ask the site owner to give its token Contents and Pull requests access.`,
      );
    default:
      return new SubmissionError(
        "github_failed",
        502,
        `GitHub answered ${response.status}${typeof detail === "string" ? `: ${detail}` : ""}. Try again in a moment.`,
      );
  }
}

async function call<T>(target: GitHubTarget, method: string, path: string, body?: unknown): Promise<T> {
  const response = await send(target, method, path, body);
  if (!response.ok) throw await failure(target, response);
  return await response.json() as T;
}

/** `content/My Note.md` as a URL path: each segment encoded. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** A note's source at the build commit, byte for byte: frontmatter, line endings and a byte-order mark included. */
export async function readSource(target: GitHubTarget, path: string): Promise<string> {
  const response = await send(
    target, "GET", `/contents/${encodePath(path)}?ref=${target.commit}`, undefined, "application/vnd.github.raw",
  );
  if (response.status === 404) {
    throw new SubmissionError(
      "source_missing",
      502,
      `GitHub has no ${path} at commit ${target.commit.slice(0, 7)}. The site may have been built from a commit that was never pushed.`,
    );
  }
  if (!response.ok) throw await failure(target, response);
  // `ignoreBOM` keeps a byte-order mark that `response.text()` would strip.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
}

/** `svartz/submission/edit/guides-setup-<id>`: the kind, the page and the submission's id. */
export function submissionBranch({ kind, page, id }: Pick<Submission, "kind" | "page" | "id">): string {
  const slug = page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_BRANCH_SLUG).replace(/-+$/, "");
  return `svartz/submission/${kind}/${slug || "home"}-${id}`;
}

/** Keep a reader's note from notifying people: `@name` gets an invisible word joiner after the `@`. */
function quietMentions(text: string): string {
  return text.replace(/@(?=[\w-])/g, "@⁠");
}

function pullRequestBody(submission: Submission, commit: string): string {
  const note = submission.note.trim();
  return [
    note ? quietMentions(note) : "_No description given._",
    "",
    "---",
    `Submitted anonymously from ${submission.pageUrl}. Based on ${commit}.`,
  ].join("\n");
}

/** The open pull request from `branch`, if an earlier attempt at this submission opened one. */
async function openPull(target: GitHubTarget, branch: string): Promise<PullRequest | undefined> {
  const [owner] = target.repo.split("/");
  const [pull] = await call<PullRequest[]>(target, "GET", `/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
  return pull;
}

/** GitHub's 422 when `head` already has an open pull request. */
async function alreadyOpened(response: Response): Promise<boolean> {
  if (response.status !== 422) return false;
  const body = await response.clone().json().catch(() => undefined) as { errors?: Array<{ message?: unknown }> } | undefined;
  return body?.errors?.some(({ message }) => typeof message === "string" && message.startsWith("A pull request already exists")) ?? false;
}

/** Point `branch` at `sha`: a new branch, or one an earlier attempt left without a pull request. */
async function writeBranch(target: GitHubTarget, branch: string, sha: string): Promise<void> {
  const created = await send(target, "POST", "/git/refs", { ref: `refs/heads/${branch}`, sha });
  if (created.ok) return;
  if (created.status !== 422) throw await failure(target, created);
  // 422: the branch exists. No pull request uses it (checked first), so it holds an earlier attempt's commit.
  await call(target, "PATCH", `/git/refs/heads/${branch}`, { sha, force: true });
}

/**
 * Open a pull request with one commit that replaces the note at `submission.path`. The branch starts at the build
 * commit, so when the page changed since, GitHub shows a conflict instead of the edit overwriting it.
 *
 * Safe to retry with the same `submission.id`: the branch is named after it, so a pull request an earlier attempt
 * opened is returned instead of a second one. A pull request GitHub refused takes its branch with it; one whose
 * outcome is unknown keeps it, for the retry to find.
 */
export async function openSubmission(target: GitHubTarget, submission: Submission): Promise<EditResponse> {
  const branch = submissionBranch(submission);
  const pull = await openPull(target, branch) ?? await createPull(target, submission, branch);
  // The pull request exists now: a label failure must not read as a failed submission the reader would resend.
  if (target.labels.length > 0) {
    await call(target, "POST", `/issues/${pull.number}/labels`, { labels: target.labels }).catch((error: unknown) => {
      console.error(`[submissions] opened pull request #${pull.number} but couldn't label it`, error);
    });
  }
  return { url: pull.html_url, number: pull.number };
}

async function createPull(target: GitHubTarget, submission: Submission, branch: string): Promise<PullRequest> {
  const base = target.branch ?? (await call<{ default_branch: string }>(target, "GET", "")).default_branch;
  const parent = await call<{ tree: { sha: string } }>(target, "GET", `/git/commits/${target.commit}`);
  const tree = await call<{ sha: string }>(target, "POST", "/git/trees", {
    base_tree: parent.tree.sha,
    tree: [{ path: submission.path, mode: "100644", type: "blob", content: submission.markdown }],
  });
  if (tree.sha === parent.tree.sha) {
    throw new SubmissionError("unchanged", 422, "Nothing has changed yet. Edit the page, then open the pull request.");
  }

  const title = `Edit ${submission.path}`;
  const note = submission.note.trim();
  const commit = await call<{ sha: string }>(target, "POST", "/git/commits", {
    message: note ? `${title}\n\n${note}` : title,
    tree: tree.sha,
    parents: [target.commit],
  });
  await writeBranch(target, branch, commit.sha);
  // No answer (`github_unavailable`) throws here and keeps the branch: the pull request may exist.
  const response = await send(target, "POST", "/pulls", { title, head: branch, base, body: pullRequestBody(submission, target.commit) });
  if (response.ok) return await response.json() as PullRequest;
  if (await alreadyOpened(response)) {
    // A concurrent attempt at this submission opened it first.
    const pull = await openPull(target, branch);
    if (pull) return pull;
  } else if (response.status < 500) {
    // A 4xx means GitHub opened nothing: drop the branch. A 5xx may not mean that, so the branch stays for a retry.
    const deleted = await send(target, "DELETE", `/git/refs/heads/${branch}`).catch(() => undefined);
    if (!deleted?.ok) console.error(`[submissions] couldn't delete branch ${branch} after GitHub refused its pull request`);
  }
  throw await failure(target, response);
}

/**
 * The PR writer: reads a note's source at the build commit and opens a submission as a pull request through
 * GitHub's REST and Git Data APIs. Uses `fetch` only, so it runs on Workers and Node alike.
 */
import type { Identity, ProviderId } from "@svartz/auth/server";
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

/** One reader's edit of a published note, or a new note. */
export interface Submission {
  /** `edit` replaces a note; `new` adds one where the build commit has no file. */
  readonly kind: "edit" | "new";
  /** The editor's id for this submission, the same on every retry; names the branch. */
  readonly id: string;
  /** Repository-relative path of the note. */
  readonly path: string;
  /**
   * Names the branch: an edited page's route, such as `/wiki/guides/setup/`, or a new note's repository path without
   * its extension. Both name the vault (its mount, or its folder), so vaults sharing a repository never share a branch.
   */
  readonly page: string;
  /** Absolute URL of the edited page, or of the site a new page was submitted from, for the pull request body. */
  readonly pageUrl: string;
  readonly markdown: string;
  readonly note: string;
  /** The signed-in reader who sent it, or `null` when anonymous. */
  readonly submitter: Identity | null;
}

interface PullRequest {
  readonly html_url: string;
  readonly number: number;
}

export const unavailable = () =>
  new SubmissionError("github_unavailable", 503, "Couldn't reach GitHub right now. Try again in a moment.");

/**
 * One GitHub request to `path` below the API root, its body read in full within {@link GITHUB_TIMEOUT_MS}. No answer
 * in time, or none at all, throws `github_unavailable`; whether GitHub acted on the request is then unknown.
 */
export async function requestGitHub(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  accept = "application/vnd.github+json",
): Promise<Response> {
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        accept,
        authorization: `Bearer ${token}`,
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

function send(target: GitHubTarget, method: string, path: string, body?: unknown, accept?: string) {
  return requestGitHub(target.token, method, `/repos/${target.repo}${path}`, body, accept);
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

const PROVIDER_NAMES = { github: "GitHub", google: "Google", discord: "Discord", x: "X" } as const satisfies Record<ProviderId, string>;

/** A reader-chosen name as plain Markdown text: no formatting, links, mentions or line breaks. */
function markdownText(text: string): string {
  return quietMentions(text.replace(/\s+/g, " ").trim().replace(/[\\`*_{}[\]()<>#+!|~]/g, "\\$&"));
}

/** `[Ada Lovelace](https://github.com/ada) (signed in with GitHub)`, or `anonymously`. */
function credit(submitter: Identity | null): string {
  if (!submitter) return "anonymously";
  const name = markdownText(submitter.name);
  // A link destination in angle brackets may hold anything but whitespace and the brackets themselves.
  const profile = submitter.profileUrl && /^https:\/\/[^\s<>]+$/.test(submitter.profileUrl) ? submitter.profileUrl : undefined;
  return `by ${profile ? `[${name}](<${profile}>)` : name} (signed in with ${PROVIDER_NAMES[submitter.provider]})`;
}

/**
 * The commit's author for a GitHub sign-in: the account's noreply address, so GitHub links the commit to it. Other
 * sign-ins have no GitHub account to link; their commit keeps the site's credentials as author.
 */
function commitAuthor(submitter: Identity | null): { name: string; email: string } | undefined {
  if (submitter?.provider !== "github" || !submitter.handle) return undefined;
  const id = submitter.id.slice("github:".length);
  // Git refuses angle brackets and line breaks in a name.
  const name = submitter.name.replace(/[<>\u0000-\u001f\u007f]/g, "").trim() || submitter.handle;
  return { name, email: `${id}+${submitter.handle}@users.noreply.github.com` };
}

function pullRequestBody(submission: Submission, commit: string): string {
  const note = submission.note.trim();
  return [
    note ? quietMentions(note) : "_No description given._",
    "",
    "---",
    `Submitted ${credit(submission.submitter)} from ${submission.pageUrl}. Based on ${commit}.`,
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
  // 422: the branch exists. No pull request used it when this attempt looked, so it holds an earlier attempt's commit.
  await call(target, "PATCH", `/git/refs/heads/${branch}`, { sha, force: true });
}

/**
 * Open a pull request with one commit that replaces the note at `submission.path`, or adds it for a new page. The
 * branch starts at the build commit, so when the page changed since, GitHub shows a conflict instead of the edit
 * overwriting it. A new page whose path the build commit already holds is refused with `exists` (409).
 *
 * Safe to retry with the same `submission.id`: the branch is named after it, so a pull request an earlier attempt
 * opened is returned instead of a second one. Branches are never deleted: when GitHub refuses a pull request, another
 * attempt at the same submission may be opening one from that branch, and no lookup can rule that out race-free.
 * A refused attempt's branch stays, and a retry reuses it.
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

/** Whether anything is at `path` in the build commit. */
async function existsAtBuild(target: GitHubTarget, path: string): Promise<boolean> {
  const response = await send(target, "GET", `/contents/${encodePath(path)}?ref=${target.commit}`);
  if (response.status === 404) return false;
  if (!response.ok) throw await failure(target, response);
  return true;
}

async function createPull(target: GitHubTarget, submission: Submission, branch: string): Promise<PullRequest> {
  // A new note is added only where the build commit has nothing: the tree write below would replace a file silently.
  if (submission.kind === "new" && await existsAtBuild(target, submission.path)) {
    throw new SubmissionError("exists", 409, "A page with this title already exists. Choose another title.");
  }
  const base = target.branch ?? (await call<{ default_branch: string }>(target, "GET", "")).default_branch;
  const parent = await call<{ tree: { sha: string } }>(target, "GET", `/git/commits/${target.commit}`);
  const tree = await call<{ sha: string }>(target, "POST", "/git/trees", {
    base_tree: parent.tree.sha,
    tree: [{ path: submission.path, mode: "100644", type: "blob", content: submission.markdown }],
  });
  if (tree.sha === parent.tree.sha) {
    throw new SubmissionError("unchanged", 422, "Nothing has changed yet. Edit the page, then open the pull request.");
  }

  const title = `${submission.kind === "edit" ? "Edit" : "Add"} ${submission.path}`;
  const note = submission.note.trim();
  const author = commitAuthor(submission.submitter);
  const commit = await call<{ sha: string }>(target, "POST", "/git/commits", {
    message: note ? `${title}\n\n${note}` : title,
    tree: tree.sha,
    parents: [target.commit],
    ...(author ? { author } : {}),
  });
  await writeBranch(target, branch, commit.sha);
  // No answer (`github_unavailable`) throws here; the branch stays for a retry, and the pull request may exist.
  const response = await send(target, "POST", "/pulls", { title, head: branch, base, body: pullRequestBody(submission, target.commit) });
  if (response.ok) return await response.json() as PullRequest;
  if (await alreadyOpened(response)) {
    // A concurrent attempt at this submission opened it first.
    const pull = await openPull(target, branch);
    if (pull) return pull;
  }
  throw await failure(target, response);
}

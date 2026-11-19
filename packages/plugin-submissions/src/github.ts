/**
 * Every GitHub call: reads a note's source at the build commit, and writes a submission through GitHub's REST and Git
 * Data APIs, as a pull request or as a commit straight to the branch; reads a pull request's state and posts comments
 * on it. Uses `fetch` only, so it runs on Workers and Node alike.
 */
import type { Identity, ProviderId } from "@svartz/auth/server";
import type { ReviewReason } from "./api";
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
  /** More request headers, such as `if-none-match` for a conditional request. */
  headers: Readonly<Record<string, string>> = {},
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
        ...headers,
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

const encoder = new TextEncoder();

/** The git blob SHA of `content`, as GitHub stores it: the SHA-1 of `blob <bytes>\0` and the bytes. Text is UTF-8. */
export async function blobSha(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  const header = encoder.encode(`blob ${bytes.byteLength}\0`);
  const object = new Uint8Array(header.byteLength + bytes.byteLength);
  object.set(header);
  object.set(bytes, header.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", object));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A note's source at the build commit, byte for byte (frontmatter, line endings and a byte-order mark included), and
 * its blob SHA, which a commit checks the branch's file against.
 */
export async function readSource(target: GitHubTarget, path: string): Promise<{ markdown: string; sha: string }> {
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
  const bytes = new Uint8Array(await response.arrayBuffer());
  // `ignoreBOM` keeps a byte-order mark that `response.text()` would strip.
  return { markdown: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes), sha: await blobSha(bytes) };
}

/** `svartz/submission/edit/guides-setup-<id>`: the kind, the page and the submission's id. */
export function submissionBranch({ kind, page, id }: Pick<Submission, "kind" | "page" | "id">): string {
  const slug = page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_BRANCH_SLUG).replace(/-+$/, "");
  return `svartz/submission/${kind}/${slug || "home"}-${id}`;
}

/** Keep a reader's note from notifying people: `@name` gets an invisible word joiner after the `@`. */
export function quietMentions(text: string): string {
  return text.replace(/@(?=[\w-])/g, "@⁠");
}

const PROVIDER_NAMES = { github: "GitHub", google: "Google", discord: "Discord", x: "X" } as const satisfies Record<ProviderId, string>;

/** A reader-chosen name as plain Markdown text: no formatting, links, mentions or line breaks. */
export function markdownText(text: string): string {
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

/** Someone as git names them: `Ada Lovelace <ada@example.com>`. */
export interface Person {
  readonly name: string;
  readonly email: string;
}

/**
 * A reader-chosen name as git takes it. Angle brackets would end it early, and a line break would start a line of its
 * own in the commit message, where it could pass for a trailer.
 */
const gitName = (name: string) => name.replace(/[<>]/g, "").replace(/[\s\p{Cc}]+/gu, " ").trim();

/** A GitHub identity's noreply address, `583231+ada@users.noreply.github.com`, which GitHub links to the account. */
function githubNoreply(identity: Identity): Person | undefined {
  const id = identity.id.slice("github:".length);
  const login = identity.handle ?? "";
  if (identity.provider !== "github" || !/^\d+$/.test(id) || !/^[A-Za-z0-9-]+$/.test(login)) return undefined;
  return { name: gitName(identity.name) || login, email: `${id}+${login}@users.noreply.github.com` };
}

/**
 * A pull request commit's author for a GitHub sign-in: the account's noreply address, so GitHub links the commit to
 * it. Other sign-ins have no GitHub account to link; their commit keeps the site's credentials as author.
 */
const commitAuthor = (submitter: Identity | null) => submitter ? githubNoreply(submitter) : undefined;

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
export async function openSubmission(target: GitHubTarget, submission: Submission): Promise<{ url: string; number: number }> {
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

const unchanged = () => new SubmissionError("unchanged", 422, "Nothing has changed yet. Edit the page, then send it.");

/** `Edit content/guide.md` or `Add content/People/Ada Lovelace.md`: the commit's and the pull request's title. */
const commitTitle = ({ kind, path }: Submission) => `${kind === "edit" ? "Edit" : "Add"} ${path}`;

/** The branch submissions target: the configured one, or the repository's default. */
export async function baseBranch(target: GitHubTarget): Promise<string> {
  return target.branch ?? (await call<{ default_branch: string }>(target, "GET", "")).default_branch;
}

/** The tree `base` with the submission's note written at its path; answers the new tree's SHA. */
async function writeTree(target: GitHubTarget, base: string, submission: Submission): Promise<string> {
  const tree = await call<{ sha: string }>(target, "POST", "/git/trees", {
    base_tree: base,
    tree: [{ path: submission.path, mode: "100644", type: "blob", content: submission.markdown }],
  });
  return tree.sha;
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
  const base = await baseBranch(target);
  const parent = await call<{ tree: { sha: string } }>(target, "GET", `/git/commits/${target.commit}`);
  const tree = await writeTree(target, parent.tree.sha, submission);
  if (tree === parent.tree.sha) throw unchanged();

  const title = commitTitle(submission);
  const note = submission.note.trim();
  const author = commitAuthor(submission.submitter);
  const commit = await call<{ sha: string }>(target, "POST", "/git/commits", {
    message: note ? `${title}\n\n${note}` : title,
    tree,
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

/** Who a direct commit is by: the account behind the save, and its linked GitHub account when it has one. */
export interface Attribution {
  /** The account's stable id, written in the {@link ACCOUNT_TRAILER} for people reading the commit on GitHub. */
  readonly accountId: string;
  /** The account's display name. */
  readonly name: string;
  readonly handle: string;
  /** The site's host name. The commit's author is `<handle>@users.noreply.<host>`. */
  readonly host: string;
  /** The account's linked GitHub identity, credited as co-author so GitHub links the commit to that account. */
  readonly github?: Identity;
  /** The App's bot user, named as the commit's committer. */
  readonly committer: Person;
}

/** The trailer naming the account behind a direct commit: `Svartz-Account: <account id>`. */
export const ACCOUNT_TRAILER = "Svartz-Account";

/** Tries at moving the branch before the reader is told to try again, while other saves keep moving it first. */
const COMMIT_ATTEMPTS = 3;

/** What {@link commitSubmission} did. */
export type CommitResult =
  /**
   * The commit that holds the content. `made` says this call wrote it. When the branch already held the content the
   * call wrote nothing, and the commit answered is whoever's put it there: a retry's own first attempt, or anyone's.
   */
  | { readonly kind: "commit"; readonly url: string; readonly sha: string; readonly made: boolean }
  /**
   * Nothing, so the save goes to review: `changed` when the branch's file isn't the one the reader loaded, or a new
   * page's path is taken; `protected` when GitHub's rules for the branch refuse the commit.
   */
  | { readonly kind: "review"; readonly reason: Extract<ReviewReason, "changed" | "protected"> };

/**
 * The commit message: the title, the reader's note, then the trailers. The trailers are the message's last paragraph,
 * where git and GitHub read them, so lines in the note that look like trailers never count as any.
 */
function commitMessage(submission: Submission, attribution: Attribution): string {
  const coAuthor = attribution.github && githubNoreply(attribution.github);
  const trailers = [
    ...(coAuthor ? [`Co-authored-by: ${coAuthor.name} <${coAuthor.email}>`] : []),
    `${ACCOUNT_TRAILER}: ${attribution.accountId}`,
  ];
  return [commitTitle(submission), submission.note.trim(), trailers.join("\n")].filter(Boolean).join("\n\n");
}

/** The blob SHA of the file at `path` in commit `ref`; `undefined` when there is none, and `""` for anything but a file. */
async function blobAt(target: GitHubTarget, path: string, ref: string): Promise<string | undefined> {
  const response = await send(target, "GET", `/contents/${encodePath(path)}?ref=${ref}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw await failure(target, response);
  const body = await response.json() as { type?: unknown; sha?: unknown } | unknown[];
  // A folder answers its entries.
  return !Array.isArray(body) && body.type === "file" && typeof body.sha === "string" ? body.sha : "";
}

/** The latest commit that touched `path` in the history of commit `head`. */
async function latestCommit(target: GitHubTarget, head: string, path: string): Promise<CommitResult> {
  const query = new URLSearchParams({ sha: head, path, per_page: "1" });
  const [latest] = await call<Array<{ sha: string; html_url: string }>>(target, "GET", `/commits?${query}`);
  return latest ? { kind: "commit", url: latest.html_url, sha: latest.sha, made: false } : { kind: "review", reason: "changed" };
}

/**
 * Commit the submission straight to the branch through the Git Data API, authored as `attribution`'s account and
 * committed as its App's bot user. GitHub signs no commit that names its own author, so the commit is unsigned.
 * `loaded` is the blob SHA of the file the reader edited, and `undefined` for a new page.
 *
 * Never overwrites: the branch's file must still be `loaded`, or for a new page absent, or nothing is written and the
 * answer is `changed`, for the caller to open a pull request instead. The commit's parent is the head that check read,
 * and the branch moves only forward to it, so a save landing in between makes GitHub refuse the move; the check then
 * runs again on the new head. When GitHub refuses the move while the head stays put, a rule for the branch refused it,
 * such as one requiring pull requests or signed commits, and the answer is `protected`. A retry whose content the
 * branch already holds, as after a lost answer, answers the latest commit to the file instead of committing again.
 */
export async function commitSubmission(
  target: GitHubTarget,
  submission: Submission,
  loaded: string | undefined,
  attribution: Attribution,
): Promise<CommitResult> {
  const wanted = await blobSha(submission.markdown);
  if (wanted === loaded) throw unchanged();
  const branch = await baseBranch(target);
  const ref = `/git/refs/heads/${encodePath(branch)}`;
  const author = { name: gitName(attribution.name) || attribution.handle, email: `${attribution.handle}@users.noreply.${attribution.host}` };
  let refused: { head: string; response: Response } | undefined;
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const head = (await call<{ object: { sha: string } }>(target, "GET", `/git/ref/heads/${encodePath(branch)}`)).object.sha;
    // Refused while the branch stayed put: not a race but a rule, such as branch protection.
    if (refused?.head === head) {
      const detail = await refused.response.json().then((body: { message?: unknown }) => body?.message, () => undefined);
      console.warn(`[submissions] GitHub refused a commit to ${branch}${typeof detail === "string" ? ` (${detail})` : ""}; opening a pull request instead`);
      return { kind: "review", reason: "protected" };
    }
    const current = await blobAt(target, submission.path, head);
    // From the head checked: the branch may have moved on since, past someone else's change to the file.
    if (current === wanted) return latestCommit(target, head, submission.path);
    if (current !== loaded) return { kind: "review", reason: "changed" };
    const parent = await call<{ tree: { sha: string } }>(target, "GET", `/git/commits/${head}`);
    const tree = await writeTree(target, parent.tree.sha, submission);
    // An author of its own means GitHub would record them as committer too, unless the commit names one.
    const commit = await call<{ sha: string; html_url: string }>(target, "POST", "/git/commits", {
      message: commitMessage(submission, attribution),
      tree,
      parents: [head],
      author,
      committer: attribution.committer,
    });
    const moved = await send(target, "PATCH", ref, { sha: commit.sha, force: false });
    if (moved.ok) return { kind: "commit", url: commit.html_url, sha: commit.sha, made: true };
    if (moved.status !== 422) throw await failure(target, moved);
    refused = { head, response: moved };
  }
  throw new SubmissionError("branch_busy", 503, "Other edits are being saved right now. Try again in a moment.");
}

/** What a follow-up edit needs to know of a pull request, as GitHub says now. */
export interface PullState {
  readonly open: boolean;
  readonly merged: boolean;
  /** The branch it merges from, and the repository that branch is in (`owner/name`). */
  readonly headRef: string;
  readonly headRepo: string | null;
  readonly headSha: string;
  /** The branch it merges into, the repository that is in (`owner/name`), and that branch's commit it compares with. */
  readonly baseRef: string;
  readonly baseRepo: string | null;
  readonly baseSha: string;
  readonly title: string;
}

/** Pull request `number` as GitHub holds it now; `undefined` when GitHub has none. */
export async function readPullRequest(target: GitHubTarget, number: number): Promise<PullState | undefined> {
  const response = await send(target, "GET", `/pulls/${number}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw await failure(target, response);
  type Side = { ref?: unknown; sha?: unknown; repo?: { full_name?: unknown } | null };
  const pull = await response.json() as { state?: unknown; merged?: unknown; title?: unknown; head?: Side; base?: Side };
  const repoOf = (side: Side | undefined) => (typeof side?.repo?.full_name === "string" ? side.repo.full_name : null);
  return {
    open: pull.state === "open" && pull.merged !== true,
    merged: pull.merged === true,
    headRef: String(pull.head?.ref ?? ""),
    headRepo: repoOf(pull.head),
    headSha: String(pull.head?.sha ?? ""),
    baseRef: String(pull.base?.ref ?? ""),
    baseRepo: repoOf(pull.base),
    baseSha: String(pull.base?.sha ?? ""),
    title: String(pull.title ?? ""),
  };
}

/**
 * Post `body` on pull request `number`: on its conversation, or with `thread`, as a reply in the diff comment thread
 * that the top-level review comment `thread` starts (GitHub takes no reply to a reply). Answers the comment as GitHub
 * made it, in the shape its webhooks and lists use; 404 `thread_gone` when the thread or pull request is gone.
 */
export async function postComment(target: GitHubTarget, number: number, body: string, thread?: number): Promise<unknown> {
  const path = thread === undefined ? `/issues/${number}/comments` : `/pulls/${number}/comments/${thread}/replies`;
  const response = await send(target, "POST", path, { body });
  if (response.status === 404) {
    throw new SubmissionError("thread_gone", 404, "This conversation is gone on GitHub. Reload the page to see where it stands.");
  }
  if (!response.ok) throw await failure(target, response);
  return response.json();
}

/** One file a pull request changes, as its diff on GitHub shows it. */
export interface ChangedFile {
  /** Its repository path at the head. */
  readonly path: string;
  /** Its path at the base, when the pull request moves it. */
  readonly previousPath?: string;
  /** GitHub's word for the change: `added`, `removed`, `modified`, `renamed`… */
  readonly status: string;
  /** The unified diff's hunks, as GitHub shows them; absent for a binary file or a diff too large for GitHub to show. */
  readonly patch?: string;
}

/** Files GitHub's compare lists at most; it lists no more of a change to more files. */
export const MAX_COMPARED_FILES = 300;

/**
 * The files a pull request at commit `head` changes, as its diff on GitHub shows them: against its merge base with
 * `base`, the base branch's commit. `complete` is false when GitHub may have listed only part of them.
 */
export async function readChanges(target: GitHubTarget, base: string, head: string): Promise<{ files: ChangedFile[]; complete: boolean }> {
  // Files come whole on the first page, whatever the page size; the size only limits the commits listed beside them.
  const answer = await call<{ files?: Array<{ filename?: unknown; previous_filename?: unknown; status?: unknown; patch?: unknown }> }>(
    target, "GET", `/compare/${base}...${head}?per_page=1`,
  );
  const files = (answer.files ?? []).flatMap(({ filename, previous_filename, status, patch }): ChangedFile[] => typeof filename === "string"
    ? [{
      path: filename,
      ...(typeof previous_filename === "string" ? { previousPath: previous_filename } : {}),
      status: String(status ?? "modified"),
      ...(typeof patch === "string" ? { patch } : {}),
    }]
    : []);
  return { files, complete: files.length < MAX_COMPARED_FILES };
}

/** GitHub's answer to a write it refused as unprocessable, as text to match on. */
const refusal = async (response: Response) => (response.status === 422 ? response.clone().text().catch(() => "") : "");

/**
 * Comment on line `line` of `path` (a repository path) in pull request `number`'s diff at commit `head`: `side` is
 * `RIGHT` for a line the head holds, `LEFT` for one it removes. Answers the comment as GitHub made it. A line GitHub
 * can't place in the diff answers 422 `line_gone`; a pull request it no longer has, 404 `thread_gone`.
 */
export async function postLineComment(
  target: GitHubTarget,
  number: number,
  { body, head, path, line, side }: { body: string; head: string; path: string; line: number; side: "LEFT" | "RIGHT" },
): Promise<unknown> {
  const response = await send(target, "POST", `/pulls/${number}/comments`, { body, commit_id: head, path, line, side });
  if (response.status === 404) throw new SubmissionError("thread_gone", 404, "This pull request is gone on GitHub.");
  if (response.status === 422) {
    console.warn(`[submissions] GitHub couldn't place a comment on ${path}:${line} of #${number}: ${await refusal(response)}`);
    throw new SubmissionError("line_gone", 422, "GitHub couldn't find that line in the changes. Reload the page and try again.");
  }
  if (!response.ok) throw await failure(target, response);
  return response.json();
}

/** A review's verdict, as GitHub names it. */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/**
 * Review pull request `number` at commit `head` with `event` and `body`. Answers the review as GitHub made it. GitHub
 * lets nobody approve or request changes on their own pull request, the site's credentials included on the pull
 * requests they opened: that refusal answers 422 `own_pull_request`.
 */
export async function submitReview(target: GitHubTarget, number: number, { event, body, head }: { event: ReviewEvent; body: string; head: string }): Promise<unknown> {
  const response = await send(target, "POST", `/pulls/${number}/reviews`, { commit_id: head, event, body });
  if (/your own pull request/i.test(await refusal(response))) {
    throw new SubmissionError("own_pull_request", 422, "GitHub doesn't let the site approve or request changes on a pull request it opened.");
  }
  if (!response.ok) throw await failure(target, response);
  return response.json();
}

/** How a pull request merges: a merge commit, or one squashed commit. */
export type MergeMethod = "merge" | "squash";

/**
 * How the repository lets pull requests merge: with a merge commit, else squashed; `undefined` when it allows
 * neither. GitHub says only to credentials that may write to the repository; unsaid counts as allowed.
 */
export async function mergeMethod(target: GitHubTarget): Promise<MergeMethod | undefined> {
  const repository = await call<{ allow_merge_commit?: unknown; allow_squash_merge?: unknown }>(target, "GET", "");
  if (repository.allow_merge_commit !== false) return "merge";
  return repository.allow_squash_merge !== false ? "squash" : undefined;
}

/** Who merges a pull request from the site: the account, and the site's host. */
export interface Merger {
  readonly accountId: string;
  readonly name: string;
  readonly handle: string;
  readonly host: string;
}

/**
 * Merge pull request `number` by `method`, only while its head is still `head`, the commit the reviewer looked at.
 * The commit's message names who merged it and ends with their {@link ACCOUNT_TRAILER}, as the site's commits do.
 * Answers the commit GitHub made. A head that moved answers 409 `head_moved`; a pull request GitHub won't merge, such
 * as one with conflicts or failing required checks, 409 `not_mergeable` with GitHub's reason.
 */
export async function mergePull(
  target: GitHubTarget,
  number: number,
  { head, method, title, by }: { head: string; method: MergeMethod; title: string; by: Merger },
): Promise<{ sha: string }> {
  const name = gitName(by.name) || by.handle;
  const response = await send(target, "PUT", `/pulls/${number}/merge`, {
    sha: head,
    merge_method: method,
    commit_title: method === "merge" ? `Merge pull request #${number}` : `${title.replace(/\s+/g, " ").trim() || "Merge pull request"} (#${number})`,
    commit_message: `Merged on ${by.host} by ${name} (${by.handle}).\n\n${ACCOUNT_TRAILER}: ${by.accountId}`,
  });
  if (response.status === 409) throw new SubmissionError("head_moved", 409, "This submission changed since you opened it. Review it again before merging.");
  if (response.status === 405) {
    const reason = await response.json().then((body: { message?: unknown }) => body?.message, () => undefined);
    throw new SubmissionError("not_mergeable", 409, `GitHub won't merge it${typeof reason === "string" ? `: ${reason}` : "."}`);
  }
  if (!response.ok) throw await failure(target, response);
  const merged = await response.json() as { sha?: unknown };
  return { sha: String(merged.sha ?? "") };
}

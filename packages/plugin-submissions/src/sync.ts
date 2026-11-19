/**
 * GitHub sync and edit status, on when the plugin's `sync` option is set:
 *
 * - `POST github/webhook/` takes the App's deliveries. Its signature (`X-Hub-Signature-256`, an HMAC-SHA256 of the raw
 *   body with the webhook secret) is checked in constant time before the body is parsed; a delivery without one, with
 *   a wrong one, or for another repository is refused and nothing is stored. Deliveries of the seven mirrored events
 *   are written to the mirror (see `mirror.ts`); `ping`, other events, and deliveries with nothing the mirror keeps
 *   are acknowledged and ignored.
 * - `GET status/?edit=<submission id>` answers where a saved edit has got to, to the reader who saved it: the account
 *   or identity that saved it, or for a guest's edit whoever holds its random id. It reads the mirror only. When the
 *   mirror is stale, the reconcile poll runs after the answer, as do the ancestry checks the answer still lacks.
 *
 * An edit is live once a run of the configured workflow on the content branch, or a deployment to the configured
 * environment, succeeded at a commit that contains the edit's commit. "Contains" is never guessed from times: a
 * signal at the edit's own commit does, and any other is asked of GitHub's compare API once and remembered.
 */
import type { ServerContext } from "@svartz/core";
import { SUBMISSION_ID_PATTERN, type StatusResponse } from "./api";
import { SubmissionError } from "./errors";
import { requestGitHub } from "./github";
import {
  deploymentSignals,
  isDatabase,
  markLive,
  markSucceeded,
  migrate,
  readAncestry,
  readBranch,
  readEdit,
  readPull,
  recordEdit,
  rereadReviews,
  scopeOf,
  workflowSignals,
  writeAncestry,
  writeBranch,
  writeComment,
  writeCommit,
  writeDeployment,
  writePull,
  writeReview,
  writeRun,
  type EditRecord,
  type Mirror,
  type Statement,
} from "./mirror";
import { pause, POLL_INTERVAL_MS, readPause, reconcile, resumeAt } from "./reconcile";
import { comment, deployment, integer, list, object, pullRequest, pushedCommit, review, text, workflowRun } from "./records";
import { readBody } from "./request";

/** The `sync` option, as the server receives it. */
export interface SyncOptions {
  /** The D1 binding the mirror lives in. */
  readonly database: { readonly env: string };
  /** The server environment variable holding the App's webhook secret. */
  readonly webhookSecret: { readonly env: string };
  /** What "live" means: a successful run of a workflow file in `.github/workflows/`, or deployment to an environment. */
  readonly live: { readonly workflow: string; readonly environment?: never } | { readonly environment: string; readonly workflow?: never };
}

/** What sync needs from the rest of the plugin. */
export interface SyncSetup {
  readonly repo: string;
  /** The configured content branch; the repository's default branch when unset. */
  readonly branch?: string;
  /** The vault's folder in the repository. */
  readonly root: string;
  /** The token every GitHub call authenticates with. */
  readonly token: (env: ServerContext["env"]) => Promise<string>;
}

/** GitHub caps deliveries at 25 MB; a push of many commits stays far below this, and anything past it waits for the poll. */
const MAX_DELIVERY_BYTES = 5 * 1024 * 1024;
const SIGNATURE = /^sha256=([0-9a-f]{64})$/i;
/** How much earlier than an edit landed a run may start and still hold it, for clocks that disagree. */
const CLOCK_SKEW_MS = 5 * 60_000;
/** Commits a status read asks GitHub about after answering, at most; the rest wait for the next read. */
const MAX_ANCESTRY_CHECKS = 3;
const encoder = new TextEncoder();

/** Whether `hex`, the digits of a `sha256=` signature, is the HMAC-SHA256 of `body` with `secret`, compared in constant time. */
async function signed(body: Uint8Array, hex: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, body as Uint8Array<ArrayBuffer>));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected[index]! ^ Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return difference === 0;
}

type Payload = Readonly<Record<string, unknown>>;

/** Turns one delivery into the mirror's writes, given the content branch and the vault folder. */
type Event = (payload: Payload, mirror: Mirror, branch: string, root: string) => Statement[];

const writes = <T>(record: T | undefined, write: (record: T) => Statement) => (record ? [write(record)] : []);

/** A pull request a delivery carries, when it targets the content branch. */
function targeting(value: unknown, branch: string) {
  const pull = pullRequest(value);
  return pull?.baseRef === branch ? pull : undefined;
}

/** The mirrored events. A pull request into another branch, or a run or push on one, isn't the content's. */
const EVENTS: Readonly<Record<string, Event>> = {
  push: (payload, mirror, branch, root) =>
    payload.ref === `refs/heads/${branch}` ? list(payload.commits).flatMap((value) => writes(pushedCommit(value, root), (commit) => writeCommit(mirror, commit))) : [],
  pull_request: (payload, mirror, branch, root) =>
    writes(targeting(payload.pull_request, branch), (pull) => writePull(mirror, pull, root === "" ? 1 : null)),
  pull_request_review: (payload, mirror, branch, root) => {
    const pull = targeting(payload.pull_request, branch);
    if (!pull) return [];
    const record = review(payload.review, pull.number);
    return [writePull(mirror, pull, root === "" ? 1 : null), ...(record ? [writeReview(mirror, record), rereadReviews(mirror, pull.number)] : [])];
  },
  pull_request_review_comment: (payload, mirror, branch, root) => {
    const pull = targeting(payload.pull_request, branch);
    if (!pull) return [];
    const record = comment(payload.comment, "review", pull.number, payload.action === "deleted");
    return [writePull(mirror, pull, root === "" ? 1 : null), ...writes(record, (entry) => writeComment(mirror, entry))];
  },
  // The issue carries no base branch: a comment on a pull request into another branch is stored, and readers join it
  // to the pull requests the mirror holds.
  issue_comment: (payload, mirror) => {
    const issue = object(payload.issue);
    const number = integer(issue?.number);
    if (!object(issue?.pull_request) || number === undefined) return [];
    return writes(comment(payload.comment, "issue", number, payload.action === "deleted"), (record) => writeComment(mirror, record));
  },
  workflow_run: (payload, mirror, branch) => {
    const run = workflowRun(payload.workflow_run);
    return run?.headBranch === branch ? [writeRun(mirror, run)] : [];
  },
  deployment_status: (payload, mirror) => {
    const record = deployment(payload.deployment, payload.deployment_status);
    if (!record) return [];
    return [writeDeployment(mirror, record), ...(record.status?.state === "success" ? [markSucceeded(mirror, record.id)] : [])];
  },
};

/** Sync's routes and the hook that records each save. */
export function createSync(options: SyncOptions, setup: SyncSetup) {
  const workflow = options.live.workflow ? `.github/workflows/${options.live.workflow}` : undefined;

  /** The bound database, migrated, and this vault's scope in it. */
  async function mirrorFor(context: ServerContext): Promise<Mirror> {
    const db = context.env[options.database.env];
    if (!isDatabase(db)) {
      throw new SubmissionError("misconfigured", 503, `This site can't follow edits yet: bind a D1 database as ${options.database.env}.`);
    }
    await migrate(db);
    return { db, scope: scopeOf(setup.repo, setup.root) };
  }

  async function webhook(request: Request, context: ServerContext): Promise<Response> {
    const secret = context.env[options.webhookSecret.env];
    if (typeof secret !== "string" || !secret) {
      throw new SubmissionError("misconfigured", 503, `This site can't take GitHub's deliveries yet: its server has no ${options.webhookSecret.env} set.`);
    }
    const badSignature = () => new SubmissionError("bad_signature", 401, "The delivery's signature doesn't match the webhook secret.");
    // An unsigned request is refused before its body is read.
    const signature = request.headers.get("x-hub-signature-256")?.match(SIGNATURE)?.[1];
    if (!signature) throw badSignature();
    const body = await readBody(request, MAX_DELIVERY_BYTES);
    if (!body) throw new SubmissionError("too_large", 413, "The delivery is too large; the next poll reads it from GitHub instead.");
    if (!await signed(body, signature, secret)) throw badSignature();
    const event = EVENTS[request.headers.get("x-github-event") ?? ""];
    // `ping` on setup, and events the mirror doesn't keep: accepted, so GitHub shows the hook working.
    if (!event) return new Response(null, { status: 202 });
    let payload: Payload | undefined;
    try {
      payload = object(JSON.parse(new TextDecoder().decode(body)));
    } catch {
      payload = undefined;
    }
    const repository = object(payload?.repository);
    if (!payload || !repository) throw new SubmissionError("invalid_request", 400, "The delivery isn't one of GitHub's.");
    if (text(repository.full_name)?.toLowerCase() !== setup.repo.toLowerCase()) {
      throw new SubmissionError("other_repository", 403, `This site mirrors ${setup.repo} only.`);
    }
    const mirror = await mirrorFor(context);
    const defaultBranch = text(repository.default_branch);
    const branch = setup.branch ?? defaultBranch;
    if (!branch) throw new SubmissionError("invalid_request", 400, "The delivery names no default branch.");
    const statements = [
      ...(!setup.branch && defaultBranch ? [writeBranch(mirror, defaultBranch)] : []),
      ...event(payload, mirror, branch, setup.root),
    ];
    // A push to another branch, or outside the vault: nothing to keep, and D1 refuses an empty batch.
    if (statements.length === 0) return new Response(null, { status: 202 });
    await mirror.db.batch(statements);
    return new Response(null, { status: 204 });
  }

  /**
   * Where `edit` has got to, from the mirror, and the run and deployment heads GitHub hasn't yet said whether they
   * contain its commit.
   */
  async function editStatus(mirror: Mirror, edit: EditRecord): Promise<{ status: StatusResponse; unchecked: { commit: string; heads: string[] } }> {
    const pull = edit.pull === null ? undefined : { number: edit.pull, url: edit.url };
    const none = { commit: "", heads: [] };
    let commit = edit.commit === null ? undefined : { sha: edit.commit, url: edit.url };
    let landed = edit.savedAt;
    if (pull) {
      const row = await readPull(mirror, pull.number);
      if (!row?.merged_at) return { status: { stage: row?.state === "closed" ? "closed" : "open", pull }, unchecked: none };
      if (!row.merge_commit) return { status: { stage: "committed", pull }, unchecked: none };
      commit = { sha: row.merge_commit, url: `https://github.com/${setup.repo}/commit/${row.merge_commit}` };
      landed = row.merged_at;
    }
    if (!commit) return { status: { stage: "committed", ...(pull ? { pull } : {}) }, unchecked: none };
    const reply = (stage: StatusResponse["stage"]): StatusResponse => ({ stage, ...(pull ? { pull } : {}), commit: commit! });
    if (edit.liveAt) return { status: reply("live"), unchecked: none };

    const since = new Date(Date.parse(landed) - CLOCK_SKEW_MS).toISOString();
    const branch = setup.branch ?? await readBranch(mirror);
    const signals = workflow
      ? branch ? await workflowSignals(mirror, workflow, branch, since, commit.sha) : []
      : await deploymentSignals(mirror, options.live.environment!, since, commit.sha);
    const others = [...new Set(signals.map(({ sha }) => sha).filter((sha) => sha !== commit!.sha))];
    const verdicts = await readAncestry(mirror, commit.sha, others);
    const holding = signals.filter(({ sha }) => sha === commit!.sha || verdicts.get(sha) === true);
    const unchecked = { commit: commit.sha, heads: others.filter((sha) => !verdicts.has(sha)) };
    if (holding.some(({ outcome }) => outcome === "success")) {
      await markLive(mirror, edit.id, new Date().toISOString());
      return { status: reply("live"), unchecked: none };
    }
    // The newest signal holding the edit speaks for it: an older run stuck in the queue doesn't outrank a later failure.
    const latest = holding[0]?.outcome;
    return { status: reply(latest === "pending" ? "building" : latest === "failure" ? "failed" : "committed"), unchecked };
  }

  /** When this worker last asked GitHub about each `<commit>...<head>`, so a failing answer isn't asked again on every read. */
  const asked = new Map<string, number>();

  /**
   * Ask GitHub whether each of `heads` contains `commit`, and remember what it says. Like the poll, it stops at a
   * pause before each request, and an answer saying to wait (or leaving the allowance at the poll's reserve) pauses both.
   */
  async function checkAncestry(mirror: Mirror, token: () => Promise<string>, commit: string, heads: readonly string[]): Promise<void> {
    const now = Date.now();
    for (const [pair, at] of asked) if (at <= now - POLL_INTERVAL_MS) asked.delete(pair);
    const fresh = heads.filter((head) => !asked.has(`${commit}...${head}`)).slice(0, MAX_ANCESTRY_CHECKS);
    for (const head of fresh) {
      if (await readPause(mirror) > Date.now()) return;
      asked.set(`${commit}...${head}`, now);
      const response = await requestGitHub(await token(), "GET", `/repos/${setup.repo}/compare/${commit}...${head}?per_page=1`);
      // An unknown commit, as after a force push, contains nothing; any other failure is asked again later.
      if (response.status === 404) await writeAncestry(mirror, commit, head, false);
      const status = response.ok ? text(object(await response.json())?.status) : undefined;
      if (status) await writeAncestry(mirror, commit, head, status === "ahead" || status === "identical");
      const resume = await resumeAt(response, Date.now());
      if (resume) return pause(mirror, resume);
    }
  }

  /** `owner` is the reader asking: `account:<id>`, `identity:<id>`, or `null` for a guest. */
  async function status(request: Request, context: ServerContext, owner: string | null): Promise<Response> {
    const id = new URL(request.url).searchParams.get("edit") ?? "";
    if (!SUBMISSION_ID_PATTERN.test(id)) throw new SubmissionError("invalid_request", 400, "Name the edit by its submission id.");
    const mirror = await mirrorFor(context);
    const edit = await readEdit(mirror, id);
    // Someone else's edit answers as no edit at all.
    if (edit?.owner && !owner) throw new SubmissionError("sign_in_required", 401, "Sign in to see how your edit is doing.");
    if (!edit || (edit.owner && edit.owner !== owner)) throw new SubmissionError("not_found", 404, "This site has no record of that edit.");

    const token = () => setup.token(context.env);
    const environment = options.live.environment;
    context.waitUntil(reconcile({ mirror, repo: setup.repo, root: setup.root, ...(setup.branch ? { branch: setup.branch } : {}), ...(environment ? { environment } : {}) }, token));
    const { status: answer, unchecked } = await editStatus(mirror, edit);
    if (unchecked.heads.length > 0) context.waitUntil(checkAncestry(mirror, token, unchecked.commit, unchecked.heads));
    return Response.json(answer satisfies StatusResponse, { headers: { "cache-control": "private, no-store" } });
  }

  /** Keep a save, so its saver can follow it to live. */
  async function record(context: ServerContext, edit: Omit<EditRecord, "liveAt">): Promise<void> {
    await recordEdit(await mirrorFor(context), edit);
  }

  return { webhook, status, record };
}

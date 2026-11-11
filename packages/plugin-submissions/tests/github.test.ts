import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_TIMEOUT_MS, openSubmission, readSource, type GitHubTarget, type Submission } from "../src/github";
import {
  API,
  branchFor,
  BUILD_COMMIT,
  editExchanges,
  type Exchange,
  GUIDE_SOURCE,
  labelExchange,
  PULL_42,
  pullLookup,
  REPO,
  replayGitHub,
  sharedGitHub,
  sourceExchange,
  SUBMISSION_ID,
  TOKEN,
  useFakeTimeouts,
} from "./github-exchanges";

const target: GitHubTarget = { repo: REPO, token: TOKEN, labels: ["submission"], commit: BUILD_COMMIT };
const pageUrl = "https://wiki.example/guide/";
const markdown = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
const branch = branchFor("guide");
const submission: Submission = {
  kind: "edit",
  id: SUBMISSION_ID,
  path: "content/guide.md",
  page: "/guide/",
  pageUrl,
  markdown,
  note: "Added the time it takes.",
};

/** The edit's exchanges, with the one for `METHOD /path` swapped for `replace` (none: dropped) and the rest cut. */
function editUntil(step: string, ...replace: Exchange[]): Exchange[] {
  const exchanges = editExchanges({ markdown, note: submission.note, pageUrl, branch });
  const at = exchanges.findIndex(({ request }) => `${request.method} ${request.url.slice(API.length)}` === step);
  return [...exchanges.slice(0, at), ...replace];
}

/** `METHOD /path` of each request GitHub got. */
const steps = (requests: ReadonlyArray<{ method: string; url: string }>) =>
  requests.map(({ method, url }) => `${method} ${url.slice(API.length).replace(/\?.*/, "")}`);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PR writer", () => {
  it("reads a note's source at the build commit byte for byte", async () => {
    replayGitHub([sourceExchange]);

    expect(await readSource(target, "content/guide.md")).toBe(GUIDE_SOURCE);
  });

  it("opens a labelled pull request with one commit on the submission's branch from the build commit", async () => {
    const github = replayGitHub(editExchanges({ markdown, note: submission.note, pageUrl, branch }));

    expect(await openSubmission(target, submission)).toEqual({ url: PULL_42.html_url, number: 42 });
    expect(github.pending).toEqual([]);
  });

  it("returns the opened pull request when labelling it fails", async () => {
    const github = replayGitHub(editUntil(`POST /issues/42/labels`, {
      request: labelExchange.request,
      response: { status: 503, json: { message: "Service unavailable" } },
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await openSubmission(target, submission)).toEqual({ url: PULL_42.html_url, number: 42 });
    expect(github.pending).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("#42"), expect.anything());
  });

  it("returns the pull request an earlier attempt opened instead of opening another", async () => {
    const github = replayGitHub([pullLookup(branch, [PULL_42]), labelExchange]);

    expect(await openSubmission(target, submission)).toEqual({ url: PULL_42.html_url, number: 42 });
    expect(github.pending).toEqual([]);
  });

  it("moves a branch an earlier attempt left without a pull request to this edit", async () => {
    const exchanges = editExchanges({ markdown, note: submission.note, pageUrl, branch });
    const ref = exchanges.findIndex(({ request }) => request.url.endsWith("/git/refs"));
    const sha = (exchanges[ref]!.request.body as { sha: string }).sha;
    exchanges.splice(ref, 1, {
      request: exchanges[ref]!.request,
      response: { status: 422, json: { message: "Reference already exists", status: "422" } },
    }, {
      request: { method: "PATCH", url: `${API}/git/refs/heads/${branch}`, body: { sha, force: true } },
      response: { status: 200, json: { ref: `refs/heads/${branch}`, object: { sha, type: "commit" } } },
    });
    const github = replayGitHub(exchanges);

    expect(await openSubmission(target, submission)).toEqual({ url: PULL_42.html_url, number: 42 });
    expect(github.pending).toEqual([]);
  });

  it("returns the pull request a concurrent attempt opened first", async () => {
    const github = replayGitHub([
      ...editUntil("POST /pulls"),
      {
        request: { method: "POST", url: `${API}/pulls`, body: expect.objectContaining({ head: branch }) },
        response: {
          status: 422,
          json: { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: `A pull request already exists for wikiplace:${branch}.` }] },
        },
      },
      pullLookup(branch, [PULL_42]),
      labelExchange,
    ]);

    expect(await openSubmission(target, submission)).toEqual({ url: PULL_42.html_url, number: 42 });
    expect(github.pending).toEqual([]);
  });

  it("deletes the branch when GitHub refuses the pull request", async () => {
    const github = replayGitHub([
      ...editUntil("POST /pulls"),
      {
        request: { method: "POST", url: `${API}/pulls`, body: expect.objectContaining({ head: branch }) },
        response: { status: 422, json: { message: "Validation Failed", errors: [{ resource: "PullRequest", field: "base", code: "invalid" }] } },
      },
      // No concurrent attempt opened one from the branch meanwhile.
      pullLookup(branch),
      { request: { method: "DELETE", url: `${API}/git/refs/heads/${branch}` }, response: { status: 204 } },
    ]);

    await expect(openSubmission(target, submission)).rejects.toMatchObject({ code: "github_failed", status: 502 });
    expect(github.pending).toEqual([]);
  });

  const PULL_7 = { url: `https://github.com/${REPO}/pull/7`, number: 7 };
  it.each([
    ["the attempt that created the branch", 0, [PULL_7, PULL_7]],
    ["an attempt that reused the branch", 1, [PULL_7, "github_forbidden"]],
  ] as const)("keeps a branch whose pull request a concurrent attempt opened, when GitHub refuses %s", async (_case, refuse, outcomes) => {
    const github = sharedGitHub({
      refuse,
      refusal: { status: 403, json: { message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again." } },
    });

    const attempts = await Promise.allSettled([openSubmission(target, submission), openSubmission(target, submission)]);

    expect(attempts.map((attempt) => attempt.status === "fulfilled" ? attempt.value : attempt.reason.code)).toEqual(outcomes);
    expect(github.branches).toEqual(new Set([branch]));
    expect(github.pulls).toEqual([expect.objectContaining({ number: 7, head: branch, state: "open" })]);
  });

  it.each([
    ["GitHub fails",{ status: 502, json: { message: "Server Error" } }, "github_failed", 502, 0],
    ["GitHub never answers", { status: 0, hang: true }, "github_unavailable", 503, GITHUB_TIMEOUT_MS],
  ] as const)("keeps the branch for a retry when %s to the pull request", async (_case, response, code, status, wait) => {
    useFakeTimeouts();
    const github = replayGitHub([
      ...editUntil("POST /pulls"),
      { request: { method: "POST", url: `${API}/pulls`, body: expect.objectContaining({ head: branch }) }, response },
    ]);

    const opened = openSubmission(target, submission);
    const settled = expect(opened).rejects.toMatchObject({ code, status });
    await vi.advanceTimersByTimeAsync(wait);
    await settled;
    expect(steps(github.requests).at(-1)).toBe("POST /pulls");
  });

  it("stops before writing anything when the edit changes nothing", async () => {
    const [lookup, repo, commit, tree] = editExchanges({ markdown: GUIDE_SOURCE, note: "", pageUrl, branch });
    const github = replayGitHub([lookup!, repo!, commit!, {
      request: tree!.request,
      response: { status: 201, json: { sha: (commit!.response.json as { tree: { sha: string } }).tree.sha } },
    }]);

    await expect(openSubmission(target, { ...submission, markdown: GUIDE_SOURCE, note: "" }))
      .rejects.toMatchObject({ code: "unchanged", status: 422 });
    expect(steps(github.requests)).toEqual(["GET /pulls", "GET ", `GET /git/commits/${BUILD_COMMIT}`, "POST /git/trees"]);
  });

  it("tells the reader to have the token renewed when GitHub rejects it", async () => {
    replayGitHub([{
      request: pullLookup(branch).request,
      response: { status: 401, json: { message: "Bad credentials", status: "401" } },
    }]);

    await expect(openSubmission(target, submission)).rejects.toMatchObject({
      code: "github_unauthorized",
      status: 502,
      message: "GitHub rejected this site's token. Ask the site owner to renew it.",
    });
  });
});

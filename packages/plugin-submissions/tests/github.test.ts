import { afterEach, describe, expect, it, vi } from "vitest";
import { openSubmission, readSource, type GitHubTarget, type Submission } from "../src/github";
import {
  BUILD_COMMIT,
  editExchanges,
  GUIDE_SOURCE,
  REPO,
  replayGitHub,
  sourceExchange,
  TOKEN,
} from "./github-exchanges";

const target: GitHubTarget = { repo: REPO, token: TOKEN, labels: ["submission"], commit: BUILD_COMMIT };
const pageUrl = "https://wiki.example/guide/";
const markdown = GUIDE_SOURCE.replace("Set up the wiki.", "Set up the wiki in five minutes.");
const submission: Submission = {
  kind: "edit",
  path: "content/guide.md",
  page: "/guide/",
  pageUrl,
  markdown,
  note: "Added the time it takes.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PR writer", () => {
  it("reads a note's source at the build commit byte for byte", async () => {
    replayGitHub([sourceExchange]);

    expect(await readSource(target, "content/guide.md")).toBe(GUIDE_SOURCE);
  });

  it("opens a labelled pull request with one commit on a branch from the build commit", async () => {
    const github = replayGitHub(editExchanges({ markdown, note: submission.note, pageUrl }));

    const pull = await openSubmission(target, submission);

    expect(pull).toEqual({ url: `https://github.com/${REPO}/pull/42`, number: 42 });
    expect(github.pending).toEqual([]);
    const ref = github.requests.find(({ url }) => url.endsWith("/git/refs"))?.body as { ref: string };
    const pullRequest = github.requests.find(({ url }) => url.endsWith("/pulls"))?.body as { head: string };
    expect(ref.ref).toBe(`refs/heads/${pullRequest.head}`);
  });

  it("stops before writing anything when the edit changes nothing", async () => {
    const [repo, commit, tree] = editExchanges({ markdown: GUIDE_SOURCE, note: "", pageUrl });
    const github = replayGitHub([repo!, commit!, {
      request: tree!.request,
      response: { status: 201, json: { sha: (commit!.response.json as { tree: { sha: string } }).tree.sha } },
    }]);

    await expect(openSubmission(target, { ...submission, markdown: GUIDE_SOURCE, note: "" }))
      .rejects.toMatchObject({ code: "unchanged", status: 422 });
    expect(github.requests.map(({ method, url }) => `${method} ${url.replace(/.*\/repos\/[^/]+\/[^/]+/, "")}`))
      .toEqual(["GET ", `GET /git/commits/${BUILD_COMMIT}`, "POST /git/trees"]);
  });

  it("tells the reader to have the token renewed when GitHub rejects it", async () => {
    replayGitHub([{
      request: { method: "GET", url: `https://api.github.com/repos/${REPO}` },
      response: { status: 401, json: { message: "Bad credentials", status: "401" } },
    }]);

    await expect(openSubmission(target, submission)).rejects.toMatchObject({
      code: "github_unauthorized",
      status: 502,
      message: "GitHub rejected this site's token. Ask the site owner to renew it.",
    });
  });
});

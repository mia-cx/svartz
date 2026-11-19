/**
 * GitHub's side of a submission, as request/response pairs replayed in order. Response bodies follow GitHub's
 * REST API, trimmed to the fields the PR writer reads plus enough context to recognise them.
 */
import { generateKeyPairSync } from "node:crypto";
import { expect, vi } from "vitest";

export const TOKEN = "github_pat_test";
export const REPO = "wikiplace/wikiplace.live";
export const BUILD_COMMIT = "7638417db6d59f3c431d3e1f261cc637155684cd";
/** The id the editor sent with the submission. */
export const SUBMISSION_ID = "4f1c2a9be03d5e7f8a6b1c0d9e2f3a4b";
const BASE_TREE = "691272480426f78a0138979dd3ce63b77f706feb";
const NEW_TREE = "cd8274d15fa3ae2ab983129fb037999f264ba9a7";
const NEW_COMMIT = "a6e2a36b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b";
export const API = `https://api.github.com/repos/${REPO}`;

/** {@link GUIDE_SOURCE}'s blob SHA, as `git hash-object` gives it. */
export const GUIDE_SHA = "8edbb68c2a3aa640737ed3446437ecee9979f678";
export const GUIDE_SOURCE = "﻿---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n\r\nSet up the wiki.\r\n";

/** Pull request #42, as GitHub lists or creates it. */
export const PULL_42 = { number: 42, html_url: `https://github.com/${REPO}/pull/42`, state: "open" };

export interface Exchange {
  /** `ifNoneMatch`: the ETag a conditional request sends. */
  readonly request: { readonly method: string; readonly url: string; readonly body?: unknown; readonly ifNoneMatch?: string };
  /** The `Authorization` header GitHub expects, or a matcher for it. Default: the token `replayGitHub` was given. */
  readonly authorization?: unknown;
  /** `hang`: GitHub never answers; the request ends only when its signal aborts. No `json` or `raw`: an empty body. */
  readonly response: {
    readonly status: number;
    readonly json?: unknown;
    readonly raw?: string;
    readonly hang?: true;
    readonly headers?: Readonly<Record<string, string>>;
  };
}

/** Reading `content/guide.md` at the build commit. */
export const sourceExchange: Exchange = {
  request: { method: "GET", url: `${API}/contents/content/guide.md?ref=${BUILD_COMMIT}` },
  response: { status: 200, raw: GUIDE_SOURCE },
};

/** The branch for this submission of the page whose route slugs to `slug`: `guide`, or `wiki-guide` below a mount. */
export const branchFor = (slug: string, kind: "edit" | "new" = "edit") => `svartz/submission/${kind}/${slug}-${SUBMISSION_ID}`;

/** Looking up the open pull request from `branch`. */
export const pullLookup = (branch: string, pulls: unknown[] = []): Exchange => ({
  request: { method: "GET", url: `${API}/pulls?head=${encodeURIComponent(`wikiplace:${branch}`)}&state=open` },
  response: { status: 200, json: pulls },
});

export const labelExchange: Exchange = {
  request: { method: "POST", url: `${API}/issues/42/labels`, body: { labels: ["submission"] } },
  response: { status: 200, json: [{ name: "submission", color: "ededed" }] },
};

interface Written {
  readonly markdown: string;
  readonly note: string;
  readonly pageUrl: string;
  readonly branch: string;
  /** The commit's author, when the reader signed in with GitHub. */
  readonly author?: { readonly name: string; readonly email: string };
  /** Who the pull request says sent it. Default: `anonymously`. */
  readonly credit?: string;
}

/** Whether the build commit has anything at `path`: GitHub's 404 when it doesn't. */
export const existenceCheck = (path: string, found = false): Exchange => ({
  request: { method: "GET", url: `${API}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${BUILD_COMMIT}` },
  response: found
    ? { status: 200, json: { type: "file", path, sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391" } }
    : { status: 404, json: { message: "Not Found", status: "404" } },
});

/** An edit of `path`, `content/guide.md` by default, on `branch`, from the pull request lookup to the labels. */
export function editExchanges({ path = "content/guide.md", ...written }: Written & { path?: string }): Exchange[] {
  return writeExchanges({ ...written, path, title: `Edit ${path}` });
}

/** A new note at `path` on `branch`: the lookup, the check that nothing is at `path`, then as an edit. */
export function newPageExchanges({ path, ...written }: Written & { path: string }): Exchange[] {
  const [lookup, ...rest] = writeExchanges({ ...written, path, title: `Add ${path}` });
  return [lookup!, existenceCheck(path), ...rest];
}

function writeExchanges({
  markdown, note, pageUrl, branch, path, title, author, credit = "anonymously",
}: Written & { path: string; title: string }): Exchange[] {
  return [
    pullLookup(branch),
    {
      request: { method: "GET", url: API },
      response: { status: 200, json: { full_name: REPO, default_branch: "main", private: false } },
    },
    {
      request: { method: "GET", url: `${API}/git/commits/${BUILD_COMMIT}` },
      response: { status: 200, json: { sha: BUILD_COMMIT, tree: { sha: BASE_TREE, url: `${API}/git/trees/${BASE_TREE}` }, parents: [] } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/git/trees`,
        body: { base_tree: BASE_TREE, tree: [{ path, mode: "100644", type: "blob", content: markdown }] },
      },
      response: { status: 201, json: { sha: NEW_TREE, truncated: false } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/git/commits`,
        body: { message: `${title}\n\n${note}`, tree: NEW_TREE, parents: [BUILD_COMMIT], ...(author ? { author } : {}) },
      },
      response: { status: 201, json: { sha: NEW_COMMIT, tree: { sha: NEW_TREE } } },
    },
    {
      request: { method: "POST", url: `${API}/git/refs`, body: { ref: `refs/heads/${branch}`, sha: NEW_COMMIT } },
      response: { status: 201, json: { ref: `refs/heads/${branch}`, object: { sha: NEW_COMMIT, type: "commit" } } },
    },
    {
      request: {
        method: "POST",
        url: `${API}/pulls`,
        body: {
          title,
          head: branch,
          base: "main",
          body: `${note}\n\n---\nSubmitted ${credit} from ${pageUrl}. Based on ${BUILD_COMMIT}.`,
        },
      },
      response: { status: 201, json: PULL_42 },
    },
    labelExchange,
  ];
}

/** The tip of `main` when a save commits. */
export const HEAD_COMMIT = "3a1f9c0e5b7d2468ace013579bdf2468ace01357";
/** Where `main` is after someone else's save lands first. */
export const MOVED_HEAD = "5d2e8f1a3c4b6d7e9f0a1b2c3d4e5f6a7b8c9d0e";
/** A blob SHA the editor never loaded: the file as someone else saved it. */
export const OTHER_SHA = "e5b2c7d9f1a3b4c6d8e0f2a4b6c8d0e2f4a6b8c0";
export const DIRECT_COMMIT = "c0ffee5b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b";
const HEAD_TREE = "9e8d7c6b5a49382716051f2e3d4c5b6a79881726";
const DIRECT_TREE = "1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e";

/** The repository, with `main` as its default branch. */
export const repositoryExchange: Exchange = {
  request: { method: "GET", url: API },
  response: { status: 200, json: { full_name: REPO, default_branch: "main", private: false } },
};

/** Reading where `main` points. */
export const headExchange = (sha = HEAD_COMMIT): Exchange => ({
  request: { method: "GET", url: `${API}/git/ref/heads/main` },
  response: { status: 200, json: { ref: "refs/heads/main", object: { sha, type: "commit" } } },
});

/** The file at `path` in commit `ref`: its blob `sha`, or GitHub's 404 when there is none. */
export const blobExchange = (path: string, ref: string, sha?: string): Exchange => ({
  request: { method: "GET", url: `${API}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}` },
  response: sha
    ? { status: 200, json: { type: "file", path, sha, size: 64, encoding: "base64", content: "" } }
    : { status: 404, json: { message: "Not Found", status: "404" } },
});

/**
 * Committing `markdown` at `path` on top of `head`, then moving `main` to the commit without forcing. `moved` is
 * GitHub's answer to the move: refused with 422 when `main` moved meanwhile.
 */
export function commitExchanges({ path, markdown, message, author, head = HEAD_COMMIT, moved = "ok" }: {
  path: string;
  markdown: string;
  message: string;
  author: { name: string; email: string };
  head?: string;
  /** GitHub's answer to moving `main`: refused when `main` moved meanwhile, or when a rule for `main` forbids it. */
  moved?: "ok" | "not-fast-forward" | "protected";
}): Exchange[] {
  return [
    {
      request: { method: "GET", url: `${API}/git/commits/${head}` },
      response: { status: 200, json: { sha: head, tree: { sha: HEAD_TREE }, parents: [] } },
    },
    {
      request: { method: "POST", url: `${API}/git/trees`, body: { base_tree: HEAD_TREE, tree: [{ path, mode: "100644", type: "blob", content: markdown }] } },
      response: { status: 201, json: { sha: DIRECT_TREE, truncated: false } },
    },
    {
      request: { method: "POST", url: `${API}/git/commits`, body: { message, tree: DIRECT_TREE, parents: [head], author, committer: APP_BOT } },
      response: {
        status: 201,
        json: {
          sha: DIRECT_COMMIT,
          html_url: `https://github.com/${REPO}/commit/${DIRECT_COMMIT}`,
          tree: { sha: DIRECT_TREE },
          author: { ...author, date: "2026-11-19T12:00:00Z" },
          committer: { ...APP_BOT, date: "2026-11-19T12:00:00Z" },
          verification: { verified: false, reason: "unsigned", signature: null, payload: null },
        },
      },
    },
    {
      request: { method: "PATCH", url: `${API}/git/refs/heads/main`, body: { sha: DIRECT_COMMIT, force: false } },
      response: {
        ok: { status: 200, json: { ref: "refs/heads/main", object: { sha: DIRECT_COMMIT, type: "commit" } } },
        "not-fast-forward": { status: 422, json: { message: "Update is not a fast forward", status: "422" } },
        protected: { status: 422, json: { message: "Repository rule violations found\n\nChanges must be made through a pull request.\n\n", status: "422" } },
      }[moved],
    },
  ];
}

/** The App's slug, as `GET /app` answers it. */
export const APP_SLUG = "wikiplace-editor";
/** The id of the App's bot user, `wikiplace-editor[bot]`. */
export const APP_BOT_ID = 41_898_282;
/** The App's bot user as a commit's committer. */
export const APP_BOT = { name: `${APP_SLUG}[bot]`, email: `${APP_BOT_ID}+${APP_SLUG}[bot]@users.noreply.github.com` };

/** A throwaway App private key, made per test run: `pkcs1` as GitHub's `.pem` download, `pkcs8` as OpenSSL's default. */
export const APP_KEY = (() => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    pkcs1: privateKey.export({ type: "pkcs1", format: "pem" }) as string,
    pkcs8: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicKey,
  };
})();
export const APP_ID = 1_234_567;
export const INSTALLATION_ID = 89_012_345;
export const INSTALLATION_TOKEN = "ghs_installation_test";
/** An App's JWT: three base64url parts. */
const APP_JWT = expect.stringMatching(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

/** Finding the App's installation on the repository with its JWT. */
export const installationLookup: Exchange = {
  request: { method: "GET", url: `${API}/installation` },
  authorization: APP_JWT,
  response: { status: 200, json: { id: INSTALLATION_ID, app_id: APP_ID, account: { login: "wikiplace" }, target_type: "Organization" } },
};

/** Exchanging the App's JWT for an installation token scoped to the repository, which expires at `expiresAt`. */
export const tokenExchange = (expiresAt: string, token = INSTALLATION_TOKEN): Exchange => ({
  request: {
    method: "POST",
    url: `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    body: { repositories: ["wikiplace.live"] },
  },
  authorization: APP_JWT,
  response: {
    status: 201,
    json: { token, expires_at: expiresAt, permissions: { contents: "write", pull_requests: "write", metadata: "read" }, repository_selection: "selected" },
  },
});

/** Looking up the App's bot user, which a worker's first commit does: the App's slug with its JWT, then the bot's id. */
export const committerExchanges: Exchange[] = [
  {
    request: { method: "GET", url: "https://api.github.com/app" },
    authorization: APP_JWT,
    response: { status: 200, json: { id: APP_ID, slug: APP_SLUG, name: "Wikiplace editor", owner: { login: "wikiplace" } } },
  },
  {
    request: { method: "GET", url: `https://api.github.com/users/${encodeURIComponent(APP_BOT.name)}` },
    authorization: `Bearer ${INSTALLATION_TOKEN}`,
    response: { status: 200, json: { login: APP_BOT.name, id: APP_BOT_ID, type: "Bot" } },
  },
];

/**
 * Stub `fetch` with GitHub answering `exchanges` in order; each request must match the next one, and carry `token`
 * unless the exchange expects other credentials.
 */
export function replayGitHub(exchanges: readonly Exchange[], token = TOKEN) {
  const pending = [...exchanges];
  const requests: Array<{ method: string; url: string; body?: unknown; authorization: string | null }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const ifNoneMatch = headers.get("if-none-match");
    const request = {
      method: init.method ?? "GET",
      url: String(input),
      ...(init.body === undefined ? {} : { body: JSON.parse(String(init.body)) as unknown }),
      ...(ifNoneMatch === null ? {} : { ifNoneMatch }),
    };
    const authorization = headers.get("authorization");
    requests.push({ ...request, authorization });
    const next = pending.shift();
    if (!next) throw new Error(`GitHub got an unexpected ${request.method} ${request.url}`);
    expect(request).toEqual(next.request);
    expect(authorization).toEqual(next.authorization ?? `Bearer ${token}`);
    const { status, json, raw, hang, headers: answered = {} } = next.response;
    if (hang) return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    if (raw !== undefined) return new Response(raw, { status, headers: answered });
    return json === undefined ? new Response(null, { status, headers: answered }) : Response.json(json, { status, headers: answered });
  });
  vi.stubGlobal("fetch", fetch);
  return { pending, requests };
}

/**
 * Stub `fetch` with a GitHub that keeps its branches and pull requests, for attempts that run at the same time. Every
 * pull request opened is #7. The `refuse`th request to open one (counting from 0) is answered `refusal`, but only once
 * another attempt has opened its pull request, as when GitHub's answer to this one is slow.
 */
export function sharedGitHub({ refuse, refusal }: { refuse: number; refusal: Exchange["response"] }) {
  const branches = new Set<string>();
  const pulls: Array<{ number: number; html_url: string; head: string; state: "open" | "closed" }> = [];
  const requests: Array<{ method: string; url: string }> = [];
  let opened = () => {};
  const pullOpened = new Promise<void>((resolve) => { opened = resolve; });
  let pullRequests = 0;

  const answer = async (method: string, path: string, body: Record<string, unknown> | undefined): Promise<Response> => {
    const ref = path.match(/^\/git\/refs\/heads\/(.+)$/)?.[1];
    if (method === "GET" && path.startsWith("/pulls?")) {
      const head = new URLSearchParams(path.slice("/pulls?".length)).get("head")!.split(":")[1];
      return Response.json(pulls.filter((pull) => pull.head === head && pull.state === "open"));
    }
    if (method === "GET" && path === "") return Response.json({ default_branch: "main" });
    if (method === "GET" && path.startsWith("/git/commits/")) return Response.json({ tree: { sha: BASE_TREE } });
    if (method === "POST" && path === "/git/trees") return Response.json({ sha: NEW_TREE }, { status: 201 });
    if (method === "POST" && path === "/git/commits") return Response.json({ sha: NEW_COMMIT }, { status: 201 });
    if (method === "POST" && path === "/git/refs") {
      const branch = String(body!.ref).replace("refs/heads/", "");
      if (branches.has(branch)) return Response.json({ message: "Reference already exists" }, { status: 422 });
      branches.add(branch);
      return Response.json({ ref: body!.ref }, { status: 201 });
    }
    if (method === "PATCH" && ref) return Response.json({ ref: `refs/heads/${ref}` }, { status: branches.has(ref) ? 200 : 422 });
    if (method === "DELETE" && ref) {
      branches.delete(ref);
      // GitHub closes the pull requests a deleted branch heads.
      for (const pull of pulls) if (pull.head === ref) pull.state = "closed";
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && path === "/pulls") {
      if (pullRequests++ === refuse) {
        await pullOpened;
        const { status, json } = refusal;
        return Response.json(json ?? null, { status });
      }
      const head = String(body!.head);
      if (pulls.some((pull) => pull.head === head && pull.state === "open")) {
        return Response.json({ errors: [{ message: `A pull request already exists for wikiplace:${head}.` }] }, { status: 422 });
      }
      const pull = { number: 7, html_url: `https://github.com/${REPO}/pull/7`, head, state: "open" as const };
      pulls.push(pull);
      opened();
      return Response.json(pull, { status: 201 });
    }
    if (method === "POST" && path.startsWith("/issues/")) return Response.json([], { status: 200 });
    throw new Error(`GitHub got an unexpected ${method} ${path}`);
  };

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).slice(API.length);
    requests.push({ method, url: String(input) });
    return answer(method, path, init.body === undefined ? undefined : JSON.parse(String(init.body)));
  }));
  return { branches, pulls, requests };
}

/**
 * Fake timers that `AbortSignal.timeout` obeys too: it runs on Node's internal timers, so this one is rebuilt on
 * the faked clock. Undone by `vi.useRealTimers()` and `vi.restoreAllMocks()`.
 */
export function useFakeTimeouts() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
    return controller.signal;
  });
}

/** Reading pull request #42: a submission from this site, unless `ref` names another branch. */
export const pullExchange = ({ state = "open", ref = branchFor("wiki-guide") } = {}): Exchange => ({
  request: { method: "GET", url: `${API}/pulls/42` },
  response: { status: 200, json: { ...PULL_42, state, head: { ref, repo: { full_name: REPO } } } },
});

/** Closing pull request #42 without merging it. */
export const closeExchange: Exchange = {
  request: { method: "PATCH", url: `${API}/pulls/42`, body: { state: "closed" } },
  response: { status: 200, json: { ...PULL_42, state: "closed" } },
};

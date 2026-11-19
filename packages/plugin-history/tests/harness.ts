/**
 * A wiki at /wiki with the real `auth`, `submissions` (a GitHub App syncing into D1) and `history` server plugins
 * behind Svartz's server router, on a real D1 from Miniflare. The mirror fills through the webhook route, with
 * deliveries signed as GitHub signs them; GitHub's REST answers are replayed with the submissions plugin's exchanges.
 */
import { createHmac } from "node:crypto";
import type { Identity } from "@svartz/auth";
import { createServer, type PluginPage } from "@svartz/core";
import type { BuildData, ServerOptions } from "@svartz/plugin-submissions/server";
import { Miniflare } from "miniflare";
import { vi } from "vitest";
import type { HistoryData } from "../src/api";
import {
  API,
  APP_BOT,
  APP_ID,
  APP_KEY,
  committerExchanges,
  INSTALLATION_ID,
  INSTALLATION_TOKEN,
  REPO,
  tokenExchange,
  type Exchange,
} from "../../plugin-submissions/tests/github-exchanges";

export { replayGitHub } from "../../plugin-submissions/tests/github-exchanges";
export { API, INSTALLATION_TOKEN, REPO, type Exchange };

const ORIGIN = "https://wiki.example";
const AUTH = "/wiki/_svartz/auth";
const WEBHOOK = "/wiki/_svartz/submissions/github/webhook/";
const SECRET = "whsec-0123456789abcdef";

export const ADA: Identity = { id: "github:583231", provider: "github", name: "Ada Lovelace", handle: "ada" };

/** The published Markdown page every test reads the history of. The vault also holds `secret.md`, which it hides. */
export const GUIDE = { slug: "guide", path: "guide.md", href: "/wiki/guide/", title: "Guide" };

const HISTORY: HistoryData = {
  source: {
    repo: REPO,
    branch: "main",
    root: "content",
    credentials: { app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID } },
    database: { env: "SVARTZ_DB" },
  },
  notes: [GUIDE],
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: [], sharedNames: [] },
};

const SUBMISSIONS: ServerOptions = {
  repo: REPO,
  branch: "main",
  labels: [],
  app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
  guard: { rateLimit: { limit: 100, period: 60 } },
  mode: "permission",
  sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } },
};

const SUBMISSIONS_BUILD: BuildData = {
  commit: "7638417db6d59f3c431d3e1f261cc637155684cd",
  pages: { "/wiki/guide/": "content/guide.md" },
  routes: { guide: { slug: "guide", href: "/wiki/guide/" }, secret: { slug: "secret", href: null } },
  aliases: {},
  aliasesField: "aliases",
  vaultRoot: "content",
  folders: [""],
  links: [{ ...GUIDE, link: "Guide" }],
  preview: HISTORY.preview,
};

/** A commit, as a test describes it; `at` is minutes past 10:00 on 19 November 2026, UTC. */
export interface TestCommit {
  readonly sha: string;
  readonly message: string;
  readonly at: number;
  readonly author: { readonly name: string; readonly email: string; readonly login?: string };
  /** The App's bot by default. */
  readonly committer?: { readonly name: string; readonly email: string };
  /** Repository paths it changed. */
  readonly files: readonly string[];
}

export const GITHUB_WEB = { name: "GitHub", email: "noreply@github.com" };
const time = (minutes: number) => new Date(Date.UTC(2026, 10, 19, 10, minutes)).toISOString().replace(/\.000Z$/, "Z");

/** `commit` as a `push` delivery lists it. */
const pushed = (commit: TestCommit) => ({
  id: commit.sha,
  tree_id: "0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e",
  distinct: true,
  message: commit.message,
  timestamp: time(commit.at),
  url: `https://github.com/${REPO}/commit/${commit.sha}`,
  author: { name: commit.author.name, email: commit.author.email, ...(commit.author.login ? { username: commit.author.login } : {}) },
  committer: commit.committer ?? APP_BOT,
  added: [],
  removed: [],
  modified: commit.files,
});

/** `commit` as GitHub's REST API lists it, with its files as `GET /commits/<sha>` answers. */
export const listed = (commit: TestCommit) => ({
  sha: commit.sha,
  html_url: `https://github.com/${REPO}/commit/${commit.sha}`,
  commit: {
    message: commit.message,
    author: { name: commit.author.name, email: commit.author.email, date: time(commit.at) },
    committer: { ...(commit.committer ?? APP_BOT), date: time(commit.at) },
  },
  author: commit.author.login ? { login: commit.author.login, id: 7, type: "User" } : null,
  files: commit.files.map((filename) => ({ filename, status: "modified" })),
});

/** GitHub listing the commits that changed `path`, from `from` back, page `page`. */
export const historyExchange = (path: string, commits: readonly TestCommit[], { from = "main", page = 1, headers = {} as Record<string, string> } = {}): Exchange => ({
  request: { method: "GET", url: `${API}/commits?${new URLSearchParams({ sha: from, path, per_page: "100", page: String(page) })}` },
  authorization: `Bearer ${INSTALLATION_TOKEN}`,
  response: { status: 200, json: commits.map(listed), headers },
});

/** GitHub answering `path` at commit `sha` with `markdown`. */
export const contentExchange = (path: string, sha: string, markdown: string): Exchange => ({
  request: { method: "GET", url: `${API}/contents/${path}?ref=${sha}` },
  authorization: `Bearer ${INSTALLATION_TOKEN}`,
  response: { status: 200, raw: markdown },
});

/** The history reader's first GitHub request in a worker: its installation token. */
export const firstToken = tokenExchange("2099-01-01T00:00:00Z");
/** Looking up the App's bot user, which says whether the App committed a commit naming an account. */
export const botLookup = committerExchanges;

/** The reconcile poll's first run, which backfills: every list, `commits` answering the vault's latest commits. */
export function backfill(commits: readonly TestCommit[]): Exchange[] {
  const list = (url: string, json: unknown): Exchange => ({
    request: { method: "GET", url: `${API}${url}` },
    authorization: `Bearer ${INSTALLATION_TOKEN}`,
    response: { status: 200, json, headers: { etag: `W/"${url}"` } },
  });
  return [
    list("/actions/runs?branch=main&per_page=100", { total_count: 0, workflow_runs: [] }),
    list("/deployments?per_page=100", []),
    list("/pulls?state=all&base=main&sort=updated&direction=desc&per_page=100", []),
    list("/commits?sha=main&path=content&per_page=100", commits.map(listed)),
    list("/issues/comments?sort=updated&direction=desc&per_page=100", []),
    list("/pulls/comments?sort=updated&direction=desc&per_page=100", []),
  ];
}

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }> } };
}

const disposers: Array<() => Promise<void>> = [];

/** End every site a test made: its background work first, then its database. */
export async function disposeSites(): Promise<void> {
  for (const dispose of disposers.splice(0)) await dispose();
}

export async function createSite() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  const db = await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
  const server = createServer({
    basePath: "/wiki",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        id: "auth",
        eager: true,
        load: () => import("@svartz/auth/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } },
      },
      { id: "submissions", load: () => import("@svartz/plugin-submissions/server"), options: SUBMISSIONS, data: SUBMISSIONS_BUILD },
      { id: "history", pages: ["history", "changes"], load: () => import("../src/server"), data: HISTORY },
    ],
  }, {
    privateEnv: {
      PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
      PRIVATE_GITHUB_SECRET: "fake-client-secret",
      SVARTZ_GITHUB_APP_KEY: APP_KEY.pkcs1,
      SVARTZ_GITHUB_WEBHOOK_SECRET: SECRET,
      SVARTZ_DB: db,
    },
    building: false,
    dev: false,
  });
  /** Work the server kept alive after answering, as a Worker's `waitUntil` does. */
  const background: Promise<unknown>[] = [];
  const event = (path: string, init: RequestInit = {}) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7", platform: { ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } } };
  };
  const request = (path: string, init: RequestInit = {}) => server.handle({ event: event(path, init), resolve: async () => new Response("page") });
  /** Wait for the work kept alive after every answer so far. */
  const settle = async () => {
    while (background.length > 0) await Promise.all(background.splice(0));
  };
  disposers.unshift(settle);

  /** The plugin page at `path`, or `undefined` for the theme's 404. */
  async function page(path: string): Promise<PluginPage | undefined> {
    const result = await server.page(event(path));
    if (result && "redirect" in result) throw new Error(`unexpected redirect to ${result.redirect}`);
    return result;
  }

  /** Deliver a push of `commits` to `main`, signed with the webhook secret. */
  async function push(commits: readonly TestCommit[]): Promise<void> {
    const body = JSON.stringify({
      ref: "refs/heads/main",
      commits: commits.map(pushed),
      head_commit: pushed(commits.at(-1)!),
      repository: { id: 712_345, name: "wikiplace.live", full_name: REPO, owner: { login: "wikiplace" }, default_branch: "main" },
      sender: { login: "ada", id: 583_231 },
    });
    const response = await request(WEBHOOK, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
      },
    });
    if (response.status !== 204) throw new Error(`the push delivery answered ${response.status}`);
  }

  /** Give `person` an account through auth's real sign-in, and answer its id. */
  async function signUp(person: Identity): Promise<string> {
    const user = { id: Number(person.id.split(":")[1]), login: person.handle, name: person.name };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
      if (url === "https://api.github.com/user") return Response.json(user);
      return new Response(null, { status: 404 });
    });
    const cookies = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
    const start = await request(`${AUTH}/start/github/`);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { headers: { cookie: cookies(start).join("; ") } });
    await request(`${AUTH}/handle/`, {
      method: "POST",
      headers: { cookie: cookies(callback).join("; "), origin: ORIGIN },
      body: new URLSearchParams({ handle: person.handle! }),
    });
    vi.unstubAllGlobals();
    const { results: [row] } = await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(person.handle).all();
    return row!.id as string;
  }

  return { page, push, signUp, settle };
}

/** A page's HTML as the text a reader sees: tags dropped, character references decoded, white space collapsed. */
export const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();

/** The rows a history or changes page lists, as text, in order. */
export const rows = (page: PluginPage | undefined) =>
  (page?.html.split('<li class="sv-history-row">').slice(1) ?? []).map((row) => text(row.split("</li>")[0]!));

/**
 * A wiki at /wiki with `auth` and `submissions` syncing into a real D1 from Miniflare, for the Recent edits panel's
 * tests: `ada` is the admin, `mod` holds `submissions:pull-requests:read` on the site, and `grace` and `reader` hold
 * nothing. The mirror fills only through the routes GitHub and readers use: signed webhook deliveries, and saves
 * through the edit route. A fake GitHub answers the App's requests, the reconcile poll with empty lists, and compare
 * requests from `github.compare`. The browser tests' vitest config runs it in Node and hands the browser what it renders.
 */
import { createHmac, generateKeyPairSync } from "node:crypto";
import { createServer, type PageResult } from "@svartz/core";
import { Miniflare } from "miniflare";
import { permissions } from "../src/permissions";
import type { BuildData, ServerOptions } from "../src/server";

// As in `github-exchanges.ts`, which imports vitest's test API and so can't load in the vitest config.
export const REPO = "wikiplace/wikiplace.live";
const APP_ID = 1_234_567;
const INSTALLATION_ID = 89_012_345;
const APP_SLUG = "wikiplace-editor";
const APP_BOT_ID = 41_898_282;
/** The App's bot user as a commit's committer. */
export const APP_BOT = { name: `${APP_SLUG}[bot]`, email: `${APP_BOT_ID}+${APP_SLUG}[bot]@users.noreply.github.com` };
const HEAD_COMMIT = "3a1f9c0e5b7d2468ace013579bdf2468ace01357";
const GUIDE_SHA = "8edbb68c2a3aa640737ed3446437ecee9979f678";
const GUIDE_SOURCE = "---\ntitle: Guide\n---\n\n# Guide\n\nSet up the wiki.\n";
const SUBMISSION_ID = "4f1c2a9be03d5e7f8a6b1c0d9e2f3a4b";

export const ORIGIN = "https://wiki.test";
export const PANEL = "/wiki/-/dashboard/submissions/recent-edits/";
const AUTH = "/wiki/_svartz/auth";
const BASE = "/wiki/_svartz/submissions";
const SECRET = "whsec-0123456789abcdef";
const SESSION_SECRET = "test-secret-0123456789-abcdefghijklmnop";

export type Viewer = "ada" | "grace" | "mod" | "reader";
const GITHUB_IDS: Readonly<Record<Viewer, number>> = { ada: 583_231, grace: 2, mod: 3, reader: 4 };
const NAMES: Readonly<Record<Viewer, string>> = { ada: "Ada Lovelace", grace: "Grace Hopper", mod: "Mo Derator", reader: "Rea Der" };

const note = (path: string, title: string) => {
  const slug = path.replace(/\.md$/, "").toLowerCase().replaceAll(" ", "-");
  return { link: title, title, slug, path, href: `/wiki/${slug}/` };
};
/** The published notes. Anything else under `content/` but `images/map.png`, the site doesn't publish. */
export const NOTES = [
  note("guide.md", "Guide"),
  note("setup.md", "Setup"),
  note("People/Ada Lovelace.md", "Ada Lovelace"),
  note("People/Charles Babbage.md", "Charles Babbage"),
  note("Places/London.md", "London"),
  note("Places/Paris.md", "Paris"),
  note("Events/Expo.md", "Expo"),
];
const BUILD: BuildData = {
  commit: "7638417db6d59f3c431d3e1f261cc637155684cd",
  pages: { "/wiki/guide/": "content/guide.md" },
  routes: Object.fromEntries(NOTES.map(({ slug, href }) => [slug, { slug, href }])),
  aliases: {},
  aliasesField: "aliases",
  vaultRoot: "content",
  folders: [""],
  links: NOTES,
  preview: { linkResolution: "shallowest", mountPath: "/wiki", tagsRoute: "tags", attachments: ["images/map.png"] },
};

/** A commit as a `push` delivery lists it. */
export interface Pushed {
  readonly id: string;
  readonly message: string;
  readonly at: string;
  readonly author: { readonly name: string; readonly email: string; readonly username?: string };
  readonly committer?: { readonly name: string; readonly email: string };
  readonly modified: readonly string[];
}

/** A hex SHA from a small number, for commits made up in tests. */
export const sha = (n: number) => n.toString(16).padStart(40, "a");

type D1 = Awaited<ReturnType<Miniflare["getD1Database"]>>;
type D1Statement = ReturnType<D1["prepare"]>;

/**
 * `db` as the site gets it, counting its calls in `calls.count` as a Worker invocation's D1 limit does: each query
 * one, and a whole batch one.
 */
function counting(db: D1) {
  const calls = { count: 0 };
  const real = new WeakMap<object, D1Statement>();
  const count = <T>(result: T) => (calls.count++, result);
  const statement = (prepared: D1Statement): D1Statement => {
    const wrapped = {
      bind: (...values: unknown[]) => statement(prepared.bind(...values)),
      first: (column?: string) => count(column === undefined ? prepared.first() : prepared.first(column)),
      all: () => count(prepared.all()),
      run: () => count(prepared.run()),
      raw: () => count(prepared.raw()),
    };
    real.set(wrapped, prepared);
    return wrapped as unknown as D1Statement;
  };
  const database = {
    prepare: (query: string) => statement(db.prepare(query)),
    batch: (statements: D1Statement[]) => count(db.batch(statements.map((each) => real.get(each)!))),
    exec: (query: string) => count(db.exec(query)),
  };
  return { database, calls };
}

export async function createEditsSite() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  const db = await miniflare.getD1Database("SVARTZ_DB");
  const { database, calls: d1 } = counting(db);
  const options: ServerOptions = {
    repo: REPO,
    labels: [],
    app: { id: APP_ID, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" }, installation: INSTALLATION_ID },
    guard: { rateLimit: { limit: 100, period: 60 } },
    mode: "permission",
    sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } },
  };
  const server = createServer({
    basePath: "/wiki",
    vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard"], load: () => import("@svartz/auth/server"),
        options: {
          providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } },
          admins: [`github:${GITHUB_IDS.ada}`],
          permissions: permissions(false, true),
        },
        data: { permissions: [], paths: [] },
      },
      { id: "submissions", load: () => import("../src/server"), options, data: BUILD },
    ],
  }, {
    privateEnv: {
      PRIVATE_SVARTZ_SESSION_SECRET: SESSION_SECRET,
      PRIVATE_GITHUB_SECRET: "fake-client-secret",
      SVARTZ_GITHUB_APP_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }),
      SVARTZ_GITHUB_WEBHOOK_SECRET: SECRET,
      SVARTZ_DB: database,
    },
    building: false,
    dev: false,
  });

  /**
   * What the fake GitHub answers and has been asked. `down` makes every request fail, as when GitHub is unreachable;
   * `user` is who signs in next; `committed` is the SHA the next commit gets.
   */
  const github = { compare: new Map<string, string>(), requests: [] as string[], down: false, user: "ada" as Viewer, committed: "" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "github.com" && url.hostname !== "api.github.com") return realFetch(input, init);
    const method = init.method ?? "GET";
    github.requests.push(`${method} ${url.pathname}${url.search}`);
    if (github.down) throw new TypeError("fetch failed");
    return fakeGitHub(method, url, github);
  };

  /** Work the server kept alive after answering, as a Worker's `waitUntil` does. */
  const background: Promise<unknown>[] = [];
  const event = (request: Request) => ({
    request, url: new URL(request.url), getClientAddress: () => "203.0.113.7",
    platform: { ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } },
  });
  const handle = (request: Request) => server.handle({ event: event(request), resolve: async () => new Response(null, { status: 404 }) });
  const fetchAt = (path: string, init: RequestInit = {}) => handle(new Request(`${ORIGIN}${path}`, init));
  /** Wait for the work kept alive after every answer so far. */
  const settle = async () => {
    while (background.length > 0) await Promise.allSettled(background.splice(0));
  };

  /** Sign up GitHub user `viewer` with that handle, as the callback would; answer the session cookie's `name=value`. */
  async function signUp(viewer: Viewer): Promise<string> {
    github.user = viewer;
    const cookies = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));
    const start = await fetchAt(`${AUTH}/start/github/`);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const back = await fetchAt(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { headers: { cookie: cookies(start).join("; ") } });
    const chosen = await fetchAt(`${AUTH}/handle/`, {
      method: "POST", headers: { cookie: cookies(back).join("; "), origin: ORIGIN }, body: new URLSearchParams({ handle: viewer }),
    });
    return cookies(chosen).find((pair) => pair.startsWith("__Host-svartz-session="))!;
  }

  const sessions = { ada: await signUp("ada"), grace: await signUp("grace"), mod: await signUp("mod"), reader: await signUp("reader") };
  await fetchAt(`${AUTH}/people/grant/`, {
    method: "POST", headers: { cookie: sessions.ada, origin: ORIGIN },
    body: new URLSearchParams({ "actor-type": "account", actor: "mod", permission: "submissions:pull-requests:read", scope: "site", path: "", value: "allow" }),
  });

  const accountId = async (handle: Viewer) =>
    (await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(handle).first<{ id: string }>())!.id;

  /** Post `payload` as GitHub delivers event `name`, signed with the webhook secret. */
  async function deliver(name: string, payload: object): Promise<Response> {
    const body = JSON.stringify({ ...payload, repository: { full_name: REPO, default_branch: "main" }, sender: { login: "ada" } });
    return fetchAt(`${BASE}/github/webhook/`, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-github-event": name,
        "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
      },
    });
  }

  /** Deliver a push of `commits` to `main`, oldest first. */
  const push = (commits: readonly Pushed[]) => deliver("push", {
    ref: "refs/heads/main",
    commits: commits.map(({ id, message, at, author, committer, modified }) => ({
      id, message, timestamp: at, url: `https://github.com/${REPO}/commit/${id}`,
      author, committer: committer ?? author, added: [], removed: [], modified,
    })),
  });

  /** Deliver a run of `deploy.yml` at `head`, with `conclusion` once completed. */
  const run = (id: number, head: string, at: string, status: string, conclusion: string | null = null) => deliver("workflow_run", {
    action: status === "completed" ? "completed" : "in_progress",
    workflow_run: {
      id, name: "Deploy", path: ".github/workflows/deploy.yml", head_branch: "main", head_sha: head, event: "push", status, conclusion,
      run_attempt: 1, html_url: `https://github.com/${REPO}/actions/runs/${id}`, created_at: at, updated_at: at,
    },
  });

  /**
   * `viewer` saves an edit of the guide through the edit route, as submission `id`: an admin's commits as the App as
   * `commit`, anyone else's opens pull request #42. Either way, a save the site recorded.
   */
  async function saveGuide(viewer: Viewer, commit: string, id = SUBMISSION_ID): Promise<Response> {
    github.committed = commit;
    return fetchAt(`${BASE}/edit/`, {
      method: "POST",
      headers: { cookie: sessions[viewer], origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ submissionId: id, page: "/wiki/guide/", markdown: GUIDE_SOURCE.replace("Set up", "Plant"), note: "", sha: GUIDE_SHA }),
    });
  }

  return {
    sessions,
    github,
    /** The site's D1 calls so far; set `count` to 0 to start counting one request's. */
    d1,
    deliver,
    push,
    run,
    saveGuide,
    accountId,
    settle,
    /** The page at `path` as `viewer` sees it, signed out for `null`, or `null` for the 404. */
    page: async (viewer: Viewer | null, path: string): Promise<PageResult | null> => {
      const headers: Record<string, string> = viewer ? { cookie: sessions[viewer] } : {};
      return await server.page(event(new Request(`${ORIGIN}${path}`, { headers }))) ?? null;
    },
    dispose: async () => {
      await settle();
      globalThis.fetch = realFetch;
      await miniflare.dispose();
    },
  };
}

export type EditsSite = Awaited<ReturnType<typeof createEditsSite>>;

/** The commits {@link seedEdits} makes, oldest first. */
export const COMMITS = {
  /** Ada's save of the guide, which the site committed as the App: live. */
  site: "c0ffee5b2dbb2f1c4e7d3e4a5b9f0c1d2e3f4a5b",
  /** Grace's save of the guide, which the site opened as pull request #42, squash-merged on GitHub as this commit. */
  merged: sha(2),
  /** A copy of Ada's commit (her author address, the App as committer, her trailer) that the site has no record of. */
  copied: sha(7),
  /** By a git author with no GitHub account. */
  local: sha(3),
  /** By mallory on GitHub, with a trailer claiming to be Ada: building. */
  forged: sha(4),
  /** By grace-gh on GitHub, touching seven pages, an attachment and an unpublished note: its build failed. */
  many: sha(5),
  /** By octocat, touching only an unpublished note. */
  hidden: sha(6),
};

/** A time `minutes` ago, as GitHub writes it. */
export const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");

/** Fill the mirror with {@link COMMITS} and the runs that build them, as the site and GitHub would. */
export async function seedEdits(site: EditsSite): Promise<void> {
  const ada = await site.accountId("ada");
  for (const [viewer, commit, id] of [["ada", COMMITS.site, "a".repeat(32)], ["grace", "", "b".repeat(32)]] as const) {
    const saved = await site.saveGuide(viewer, commit, id);
    if (saved.status !== 201) throw new Error(`The site didn't save ${viewer}'s edit: ${saved.status} ${await saved.text()}`);
  }
  const merged = await site.deliver("pull_request", {
    action: "closed",
    pull_request: {
      number: 42, state: "closed", title: "Edit content/guide.md", user: { login: APP_BOT.name },
      head: { ref: "svartz/submission/edit/wiki-guide", sha: sha(42) }, base: { ref: "main" },
      html_url: `https://github.com/${REPO}/pull/42`, created_at: ago(55), updated_at: ago(50), closed_at: ago(50),
      merged_at: ago(50), merge_commit_sha: COMMITS.merged,
    },
  });
  if (merged.status !== 204) throw new Error(`The mirror refused the merge: ${merged.status}`);
  const adaCommit = { author: { name: "Ada Lovelace", email: "ada@users.noreply.wiki.test" }, committer: APP_BOT };
  const pushed = await site.push([
    { id: COMMITS.site, message: `Edit content/guide.md\n\nSvartz-Account: ${ada}`, at: ago(60), ...adaCommit, modified: ["content/guide.md"] },
    {
      id: COMMITS.merged, message: "Add how long setup takes (#42)", at: ago(50),
      author: { name: "Grace Hopper", email: "2+grace@users.noreply.github.com", username: "grace" },
      committer: { name: "GitHub", email: "noreply@github.com" }, modified: ["content/guide.md"],
    },
    { id: COMMITS.copied, message: `Edit content/Places/Paris.md\n\nSvartz-Account: ${ada}`, at: ago(45), ...adaCommit, modified: ["content/Places/Paris.md"] },
    {
      id: COMMITS.local, message: "Fix a typo in Setup", at: ago(40),
      author: { name: "Charles Babbage", email: "charles@example.org" }, modified: ["content/setup.md"],
    },
    {
      id: COMMITS.forged, message: `Rewrite the guide\n\nSvartz-Account: ${ada}`, at: ago(30),
      author: { name: "Mallory", email: "mallory@example.org", username: "mallory" }, modified: ["content/guide.md"],
    },
    {
      id: COMMITS.many, message: "Link every person, place and event\n\nAlso adds the map.", at: ago(20),
      author: { name: "Grace H.", email: "2+grace-gh@users.noreply.github.com", username: "grace-gh" },
      modified: [...NOTES.map(({ path }) => `content/${path}`), "content/images/map.png", "content/private/plans.md"],
    },
    {
      id: COMMITS.hidden, message: "Add the secret plans", at: ago(10),
      author: { name: "The Octocat", email: "octocat@example.org", username: "octocat" }, modified: ["content/private/plans.md"],
    },
  ]);
  if (pushed.status !== 204) throw new Error(`The mirror refused the push: ${pushed.status}`);
  await site.run(1, COMMITS.site, ago(59), "completed", "success");
  await site.run(2, COMMITS.forged, ago(29), "in_progress");
  await site.run(3, COMMITS.many, ago(19), "completed", "failure");
  await site.settle();
}

/** GitHub, as far as these tests reach it. */
function fakeGitHub(method: string, url: URL, github: { compare: Map<string, string>; user: Viewer; committed: string }): Response {
  const path = url.pathname;
  const repo = `/repos/${REPO}`;
  if (url.hostname === "github.com" && path === "/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
  if (path === "/user") return Response.json({ id: GITHUB_IDS[github.user], login: github.user, name: NAMES[github.user] });
  if (path === `/app/installations/${INSTALLATION_ID}/access_tokens`) {
    return Response.json({ token: "ghs_installation_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
  }
  if (path === "/app") return Response.json({ id: APP_ID, slug: APP_SLUG });
  if (path === `/users/${encodeURIComponent(APP_BOT.name)}`) return Response.json({ login: APP_BOT.name, id: APP_BOT_ID, type: "Bot" });
  if (!path.startsWith(repo)) return Response.json({ message: "Not Found" }, { status: 404 });
  const below = path.slice(repo.length);
  if (below === "") return Response.json({ full_name: REPO, default_branch: "main" });
  if (below === "/git/ref/heads/main") return Response.json({ object: { sha: HEAD_COMMIT, type: "commit" } });
  if (below.startsWith("/contents/")) return Response.json({ type: "file", sha: GUIDE_SHA, content: "" });
  if (method === "GET" && below.startsWith("/git/commits/")) return Response.json({ sha: below.slice("/git/commits/".length), tree: { sha: "9e8d7c6b5a49382716051f2e3d4c5b6a79881726" } });
  if (method === "POST" && below === "/git/trees") return Response.json({ sha: "1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e" }, { status: 201 });
  // A save that opens a pull request: its branch, then pull request #42.
  if (method === "POST" && below === "/git/refs") return Response.json({ ref: "refs/heads/submission" }, { status: 201 });
  if (method === "POST" && below === "/pulls") return Response.json({ number: 42, html_url: `https://github.com/${REPO}/pull/42` }, { status: 201 });
  if (method === "POST" && below === "/git/commits") {
    return Response.json({ sha: github.committed, html_url: `https://github.com/${REPO}/commit/${github.committed}` }, { status: 201 });
  }
  if (method === "PATCH" && below === "/git/refs/heads/main") return Response.json({ object: { sha: github.committed } });
  const compared = below.match(/^\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/);
  if (compared) return Response.json({ status: github.compare.get(`${compared[1]}...${compared[2]}`) ?? "diverged" });
  if (below === "/actions/runs") return Response.json({ total_count: 0, workflow_runs: [] });
  if (["/deployments", "/pulls", "/commits", "/issues/comments", "/pulls/comments"].includes(below)) return Response.json([]);
  return Response.json({ message: "Not Found" }, { status: 404 });
}

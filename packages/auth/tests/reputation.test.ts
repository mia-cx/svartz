import { createServer, type PermissionDeclaration, type PluginPage, type ServerHandler } from "@svartz/core";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { can, findStanding, postReputation, readAccount, reverseReputation, userPageOf } from "../src/server";

const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";
const DASHBOARD = "/notes/-/dashboard/";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const ADMIN = 1;

const PERMISSIONS: PermissionDeclaration[] = [{ slug: "guestbook:entries:delete", name: "Delete any entry", description: "Remove anyone's entry." }];

interface Database {
  prepare(query: string): { bind(...values: unknown[]): { all(): Promise<{ results: Record<string, unknown>[] }>; run(): Promise<unknown> } };
}

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function createDatabase(): Promise<Database> {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["SVARTZ_DB"] });
  disposers.push(() => miniflare.dispose());
  return await miniflare.getD1Database("SVARTZ_DB") as unknown as Database;
}

/**
 * A vault at /notes with auth (GitHub user 1 is the admin), holding the user pages `userPages` names, and a `probe`
 * plugin answering `can()`. A fresh D1 unless given `db`.
 */
async function site({ db: given, userPages = {} }: { db?: Database; userPages?: Record<string, string> } = {}) {
  const db = given ?? await createDatabase();
  const probe = (): ServerHandler => async (request, context) =>
    Response.json(await can(await readAccount(request, context.env), "guestbook:entries:delete", { vault: "notes" }, context.env));
  const server = createServer({
    basePath: "/notes",
    vault: { id: "notes", mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth", eager: true, pages: ["account", "dashboard"], load: () => import("../src/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } }, admins: [`github:${ADMIN}`], permissions: PERMISSIONS, userPageVault: "notes" },
        data: { permissions: [], paths: [], userPages },
      },
      { id: "probe", load: async () => ({ default: probe }) },
    ],
  }, { privateEnv: { PRIVATE_SVARTZ_SESSION_SECRET: SECRET, PRIVATE_GITHUB_SECRET: "fake-client-secret", SVARTZ_DB: db }, building: false, dev: false });
  const event = (path: string, init: RequestInit) => {
    const request = new Request(`${ORIGIN}${path}`, init);
    return { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7" };
  };
  const request = (path: string, { cookies = [] as string[], method = "GET", body, origin = method === "POST" ? ORIGIN : undefined }: { cookies?: string[]; method?: string; body?: URLSearchParams; origin?: string } = {}) => {
    const headers = new Headers({ cookie: cookies.join("; ") });
    if (origin) headers.set("origin", origin);
    return server.handle({ event: event(path, { method, headers, body }), resolve: async () => new Response("page") });
  };
  const page = async (path: string, cookies: string[] = []): Promise<PluginPage | undefined> => {
    const result = await server.page(event(path, { headers: { cookie: cookies.join("; ") } }));
    if (result && "redirect" in result) throw new Error("unexpected redirect");
    return result;
  };
  const post = (route: string, cookies: string[], form: Record<string, string>, origin?: string) =>
    request(`${AUTH}/${route}/`, { method: "POST", cookies, body: new URLSearchParams(form), ...origin !== undefined && { origin } });
  const env = { SVARTZ_DB: db };
  const rows = async (sql: string) => (await db.prepare(sql).bind().all()).results;
  const score = async (handle: string) => (await (await request(`${AUTH}/users/${handle}/`)).json() as { reputation: number }).reputation;
  const mayDelete = async (cookies: string[]) => (await request("/notes/_svartz/probe/", { cookies })).json();
  const id = async (handle: string) => (await rows(`SELECT id FROM auth_accounts WHERE handle = '${handle}'`))[0]!.id as string;
  return { db, request, page, post, env, rows, score, mayDelete, id };
}
type Site = Awaited<ReturnType<typeof site>>;

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((header) => header.split(";")[0]!).filter((pair) => !pair.endsWith("="));

/** Sign in with GitHub for the first time as user `id`, choosing `handle`; answer the session cookie. */
async function signUp({ request }: Site, id: number, handle: string): Promise<string[]> {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json({ id, login: handle, name: handle });
    return new Response(null, { status: 404 });
  });
  const start = await request(`${AUTH}/start/github/`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await request(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { cookies: cookiesFrom(start) });
  const chosen = await request(`${AUTH}/handle/`, { method: "POST", cookies: cookiesFrom(callback), body: new URLSearchParams({ handle }) });
  vi.unstubAllGlobals();
  return cookiesFrom(chosen);
}

/** What a reader sees of a page: its text, with entities as their characters. */
const text = (page: PluginPage | undefined) => (page?.html ?? "").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const auditLog = async ({ rows }: Site, action: string) => (await rows(`SELECT actor_handle, target, detail FROM auth_audit WHERE action = '${action}' ORDER BY id`))
  .map((row) => ({ ...row, detail: JSON.parse(row.detail as string) }));

describe("the reputation ledger", () => {
  // Proves story 23 to 25 and the ledger's contract: a score is the sum of its entries, weighed by the defaults, and an
  // event posted again (a repeated delivery, a poll reading it again) scores once.
  it("sums each event's points once, however often it is posted", async () => {
    const tour = await site();
    await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    const ada = { account: await tour.id("ada") };

    for (let delivery = 0; delivery < 2; delivery++) {
      await postReputation(tour.env, { kind: "edit", to: ada, ref: "test:commit:a", lines: 8 });
      await postReputation(tour.env, { kind: "page", to: { identity: "github:2" }, ref: "test:commit:b" });
      await postReputation(tour.env, { kind: "declined", to: ada, ref: "test:pull:7" });
      await postReputation(tour.env, { kind: "edit", to: ada, ref: "test:commit:c", lines: 0 });
    }
    // 1 + log2(8) = 4, a new page 5, a declined pull request 0, and an edit of no lines scores as one.
    expect(await tour.score("ada")).toBe(10);
    // Nobody's account: nothing to credit.
    await postReputation(tour.env, { kind: "page", to: { identity: "github:404" }, ref: "test:commit:d" });
    expect(await tour.rows("SELECT COUNT(*) AS n FROM auth_reputation")).toEqual([{ n: 4 }]);
    await expect(tour.rows("DELETE FROM auth_reputation")).rejects.toThrow(/append-only/);
    await expect(tour.rows("UPDATE auth_reputation SET points = 1000")).rejects.toThrow(/append-only/);
  });

  // Proves story 25's rules: a +1 scores once while it stands, taking it back takes back what it gave, nobody scores
  // from their own agreement, and a change read before a later one, posted late, changes nothing.
  it("credits an agreement while it stands, never one's own, and never from a stale read", async () => {
    const tour = await site();
    await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    await signUp(tour, 3, "grace");
    const [ada, grace] = [await tour.id("ada"), await tour.id("grace")];
    const agree = (from: string, agreed: boolean, version: number) =>
      postReputation(tour.env, { kind: "agreement", to: { identity: "github:2" }, ref: `test:comment-1:${from}`, from, agreed, version });

    await agree(grace, true, 1);
    await agree(grace, true, 1);
    expect(await tour.score("ada")).toBe(0.5);
    await agree(grace, false, 2);
    await agree(grace, false, 3);
    expect(await tour.score("ada")).toBe(0);
    await agree(grace, true, 4);
    expect(await tour.score("ada")).toBe(0.5);
    await agree(grace, false, 2);
    expect(await tour.score("ada")).toBe(0.5);
    await agree(ada, true, 1);
    expect(await tour.score("ada")).toBe(0.5);
  });

  // Proves the bound on farming: what an account earns a day from edits, pages and +1s stops at the daily limit.
  it("stops at the daily limit", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    await tour.post("reputation/points", root, { edit: "1", page: "5", agreement: "0.5", kudos: "5", declined: "0", "daily-limit": "12" });
    const ada = { account: await tour.id("ada") };

    for (let commit = 0; commit < 5; commit++) await postReputation(tour.env, { kind: "page", to: ada, ref: `test:commit:${commit}` });

    expect(await tour.score("ada")).toBe(12);
  });

  // Proves story 26's ledger side: a reversal takes back exactly what an event earned its account, once however often
  // it is posted, keeps an event not posted yet from ever scoring, writes nothing for an event that earned that account
  // nothing, and leaves a role the score gave in place.
  it("takes back what reverted events earned, once, and never what they didn't", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    const ada = await signUp(tour, 2, "ada");
    await signUp(tour, 3, "grace");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("people/grant", root, { "actor-type": "role", actor: "editors", permission: "guestbook:entries:delete", scope: "site", path: "", value: "allow" });
    await tour.post("reputation/threshold", root, { role: "editors", score: "9" });
    const [adaId, graceId] = [await tour.id("ada"), await tour.id("grace")];
    await postReputation(tour.env, { kind: "edit", to: { account: adaId }, ref: "test:commit:a", lines: 8 });
    await postReputation(tour.env, { kind: "page", to: { account: adaId }, ref: "test:commit:b" });
    await postReputation(tour.env, { kind: "page", to: { account: graceId }, ref: "test:commit:c" });
    expect(await tour.mayDelete(ada)).toBe(true);

    const reversals = [
      { account: adaId, ref: "test:commit:a" },
      // Not posted yet: its credit is still owed.
      { account: adaId, ref: "test:commit:later" },
      // It credited Grace, not Ada.
      { account: adaId, ref: "test:commit:c" },
    ];
    await reverseReputation(tour.env, reversals);
    await reverseReputation(tour.env, reversals);
    await postReputation(tour.env, { kind: "edit", to: { account: adaId }, ref: "test:commit:later", lines: 3 });

    // 4 for the edit and 5 for the page, less the edit's 4.
    expect(await tour.score("ada")).toBe(5);
    expect(await tour.score("grace")).toBe(5);
    expect(await tour.rows("SELECT account_id, ref, points FROM auth_reputation WHERE source = 'reversal' ORDER BY id")).toEqual([
      { account_id: adaId, ref: "test:commit:a", points: -4 },
      { account_id: adaId, ref: "test:commit:later", points: 0 },
    ]);
    expect(await tour.mayDelete(ada)).toBe(true);
  });
});

describe("thresholds", () => {
  // Proves stories 27 and 29: crossing a threshold set on the panel gives its role, with an audit entry, and the role's
  // grants follow; only an admin can take that role away, and it stays away while the score stays above.
  it("give a role once a score reaches them, and never give it back after an admin takes it", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    const mod = await signUp(tour, 2, "mod");
    const ada = await signUp(tour, 3, "ada");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("people/grant", root, { "actor-type": "role", actor: "editors", permission: "guestbook:entries:delete", scope: "site", path: "", value: "allow" });
    for (const permission of ["auth:grants:read", "auth:grants:write"]) {
      await tour.post("people/grant", root, { "actor-type": "account", actor: "mod", permission, scope: "site", path: "", value: "allow" });
    }
    const saved = await tour.post("reputation/threshold", root, { role: "editors", score: "9" });
    expect(saved.headers.get("location")).toBe(`${DASHBOARD}auth/reputation/?status=threshold-saved&role=editors`);
    const credit = (ref: string) => postReputation(tour.env, { kind: "page", to: { identity: "github:3" }, ref });

    await credit("test:commit:1");
    expect(await tour.mayDelete(ada)).toBe(false);
    await credit("test:commit:2");
    expect(await tour.mayDelete(ada)).toBe(true);
    expect(await auditLog(tour, "auth:role:promote")).toEqual([
      { actor_handle: "auth:reputation", target: "editors", detail: { account: "ada", score: 10, threshold: 9 } },
    ]);

    const remove = (cookies: string[]) => tour.post("people/member/remove", cookies, { role: "editors", handle: "ada" });
    expect((await remove(mod)).headers.get("location")).toContain("status=member-promoted");
    expect(await tour.mayDelete(ada)).toBe(true);
    expect(text(await tour.page(`${DASHBOARD}auth/people/`, mod))).toContain("@ada ada By reputation");
    expect((await remove(root)).headers.get("location")).toContain("status=member-removed");
    await credit("test:commit:3");
    await tour.post("reputation/threshold", root, { role: "editors", score: "10" });
    expect(await tour.mayDelete(ada)).toBe(false);
    expect(await auditLog(tour, "auth:role:promote")).toHaveLength(1);
  });

  // Proves a threshold applies to scores already earned: saving one gives the role to everyone already past it.
  it("give the role to accounts already past one when it is saved", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    const ada = await signUp(tour, 2, "ada");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("people/grant", root, { "actor-type": "role", actor: "editors", permission: "guestbook:entries:delete", scope: "site", path: "", value: "allow" });
    await postReputation(tour.env, { kind: "page", to: { identity: "github:2" }, ref: "test:commit:1" });

    await tour.post("reputation/threshold", root, { role: "editors", score: "5" });

    expect(await tour.mayDelete(ada)).toBe(true);
  });

  // Proves a threshold is reached at the score the account sees: points of 0.1 and 0.7 make 0.8, though their floating
  // point sum is 0.7999999999999999.
  it("give the role at the score shown, to two decimals", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("reputation/points", root, { edit: "1", page: "0.1", agreement: "0.5", kudos: "0.7", declined: "0", "daily-limit": "100" });
    await tour.post("reputation/threshold", root, { role: "editors", score: "0.8" });

    await postReputation(tour.env, { kind: "page", to: { identity: "github:2" }, ref: "test:commit:1" });
    await tour.post("reputation/kudos", root, { handle: "ada", reason: "Thanks." });

    expect(await tour.score("ada")).toBe(0.8);
    expect(await auditLog(tour, "auth:role:promote")).toEqual([
      { actor_handle: "auth:reputation", target: "editors", detail: { account: "ada", score: 0.8, threshold: 0.8 } },
    ]);
    expect(text(await tour.page(`${DASHBOARD}auth/people/`, root))).toContain("@ada ada By reputation");
  });

  // Proves a promotion that failed after its points landed is finished by posting the event again, for each kind of
  // event: a webhook delivered again, a +1 settled again, kudos given again.
  it("give a role that a failed promotion missed once the event is posted again", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    await signUp(tour, 3, "grace");
    await signUp(tour, 4, "lin");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("reputation/points", root, { edit: "1", page: "5", agreement: "5", kudos: "5", declined: "0", "daily-limit": "100" });
    await tour.post("reputation/threshold", root, { role: "editors", score: "5" });
    const ada = await tour.id("ada");
    const page = () => postReputation(tour.env, { kind: "page", to: { account: ada }, ref: "test:commit:1" });
    const agreement = () => postReputation(tour.env, { kind: "agreement", to: { identity: "github:3" }, ref: `test:comment-1:${ada}`, from: ada, agreed: true, version: 1 });
    const kudos = () => tour.post("reputation/kudos", root, { handle: "lin", reason: "Thanks." });
    await tour.rows("CREATE TRIGGER fail_promotion BEFORE INSERT ON auth_role_members BEGIN SELECT RAISE(ABORT, 'promotion failed'); END");
    await expect(page()).rejects.toThrow(/promotion failed/);
    await expect(agreement()).rejects.toThrow(/promotion failed/);
    await expect(kudos()).rejects.toThrow(/promotion failed/);
    await tour.rows("DROP TRIGGER fail_promotion");

    await page();
    await agreement();
    await kudos();

    expect([await tour.score("ada"), await tour.score("grace"), await tour.score("lin")]).toEqual([5, 5, 5]);
    expect((await auditLog(tour, "auth:role:promote")).map(({ detail }) => detail.account)).toEqual(["ada", "grace", "lin"]);
  });

  // Proves the panel's bounds: no weight or threshold outside its range, no NaN or infinity, and no threshold for the
  // admin role or a role that doesn't exist; and only someone who may change grants may change any of it.
  it("refuse values out of bounds, the admin role, unknown roles, and anyone who may not change grants", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    const reader = await signUp(tour, 2, "reader");
    await tour.post("people/role", root, { name: "editors" });
    const points = { edit: "1", page: "5", agreement: "0.5", kudos: "5", declined: "0", "daily-limit": "100" };
    const status = async (route: string, form: Record<string, string>) => new URL((await tour.post(route, root, form)).headers.get("location")!, ORIGIN).searchParams.get("status");

    for (const [field, value] of [["edit", "NaN"], ["page", "Infinity"], ["kudos", "1e9"], ["agreement", "-1"], ["declined", "1"], ["daily-limit", "0"], ["edit", ""]]) {
      expect(await status("reputation/points", { ...points, [field!]: value! }), `${field} = ${value}`).toBe("points-invalid");
    }
    for (const [role, score, expected] of [["admin", "5", "role-unknown"], ["nobody", "5", "role-unknown"], ["editors", "0", "threshold-invalid"], ["editors", "1e7", "threshold-invalid"], ["editors", "NaN", "threshold-invalid"]]) {
      expect(await status("reputation/threshold", { role: role!, score: score! }), `${role} at ${score}`).toBe(expected);
    }
    expect(await tour.rows("SELECT * FROM auth_reputation_settings")).toEqual([]);
    expect(await tour.rows("SELECT * FROM auth_reputation_thresholds")).toEqual([]);

    expect((await tour.post("reputation/points", reader, points)).status).toBe(403);
    expect((await tour.post("reputation/threshold", reader, { role: "editors", score: "5" })).status).toBe(403);
    expect((await tour.post("reputation/threshold", root, { role: "editors", score: "5" }, "https://evil.test")).status).toBe(403);
    expect(await tour.page(`${DASHBOARD}auth/reputation/`, reader)).toBeUndefined();

    expect(await status("reputation/points", { ...points, page: "7.5" })).toBe("points-saved");
    expect(await auditLog(tour, "auth:weights:set")).toEqual([{ actor_handle: "root", target: "reputation", detail: { ...Object.fromEntries(Object.entries(points).map(([key, value]) => [key, Number(value)])), page: 7.5 } }]);
    expect(text(await tour.page(`${DASHBOARD}auth/reputation/`, root))).toContain("Merged new page Instead of the edit's points. From 0 to 100.");
  });
});

describe("kudos", () => {
  // Proves story 26's kudos: a moderator with the permission gives kudos with a reason, once a day per account, never to
  // themselves; the gift is audited and shows on the recipient's account page with their next threshold.
  it("adds a moderator's kudos to an account, audited, once a day", async () => {
    const tour = await site();
    const root = await signUp(tour, ADMIN, "root");
    const mod = await signUp(tour, 2, "mod");
    const ada = await signUp(tour, 3, "ada");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("reputation/threshold", root, { role: "editors", score: "20" });
    const give = (cookies: string[], handle: string, reason = "Fixed every broken link.", origin?: string) =>
      tour.post("reputation/kudos", cookies, { handle, reason }, origin);
    const statusOf = async (response: Response) => new URL(response.headers.get("location")!, ORIGIN).searchParams.get("status");

    expect((await give(mod, "ada")).status).toBe(403);
    expect(await tour.page(`${DASHBOARD}auth/kudos/`, mod)).toBeUndefined();
    await tour.post("people/grant", root, { "actor-type": "account", actor: "mod", permission: "auth:kudos:write", scope: "site", path: "", value: "allow" });
    expect((await give(mod, "ada", "Thanks", "https://evil.test")).status).toBe(403);
    expect(await statusOf(await give(mod, "mod"))).toBe("kudos-self");
    expect(await statusOf(await give(mod, "ada", " "))).toBe("reason-invalid");
    expect(await statusOf(await give(mod, "nobody"))).toBe("account-unknown");

    expect(await statusOf(await give(mod, "@Ada"))).toBe("kudos-given");
    expect(await statusOf(await give(mod, "ada", "Again!"))).toBe("kudos-already");

    expect(await tour.score("ada")).toBe(5);
    expect(await auditLog(tour, "auth:kudos:give")).toEqual([{ actor_handle: "mod", target: "ada", detail: { reason: "Fixed every broken link.", points: 5 } }]);
    expect(text(await tour.page(`${DASHBOARD}auth/kudos/`, mod))).toContain("Give an account 5 points for good work.");
    expect(text(await tour.page("/notes/-/account/", ada))).toContain("Reputation 5 points At 20 points, you get the editors role.");
  });

  // Proves the daily limit holds when a moderator's last gifts of the day race: of two sent after nine, one lands.
  it("lets one of two racing gifts past the ninth of the day", async () => {
    const d1 = await createDatabase() as unknown as { prepare(query: string): { all(): Promise<unknown> }; batch(statements: unknown[]): Promise<unknown> };
    // While racing, each read of the weights waits until both requests have read them, so neither writes before both
    // have read.
    let race: Array<() => void> | undefined;
    const inStep = {
      prepare: (query: string) => {
        const step = race;
        if (!step || !query.startsWith("SELECT name, value FROM auth_reputation_settings")) return d1.prepare(query);
        return {
          all: async () => {
            const result = await d1.prepare(query).all();
            await new Promise<void>((resolve) => {
              step.push(resolve);
              if (step.length === 2) step.forEach((go) => go());
            });
            return result;
          },
        };
      },
      batch: (statements: unknown[]) => d1.batch(statements),
    };
    const tour = await site({ db: inStep as unknown as Database });
    const root = await signUp(tour, ADMIN, "root");
    await signUp(tour, 2, "ada");
    await signUp(tour, 3, "grace");
    const [giver, ada, day] = [await tour.id("root"), await tour.id("ada"), new Date().toISOString().slice(0, 10)];
    for (let gift = 0; gift < 9; gift++) {
      await tour.rows(`INSERT INTO auth_reputation (account_id, source, ref, points, at) VALUES ('${ada}', 'kudos', '${giver}:earlier-${gift}:${day}', 5, '${new Date().toISOString()}')`);
    }
    const statusOf = (response: Response) => new URL(response.headers.get("location")!, ORIGIN).searchParams.get("status");

    race = [];
    const answers = await Promise.all(["ada", "grace"].map((handle) => tour.post("reputation/kudos", root, { handle, reason: "Thanks." })));
    race = undefined;

    expect(answers.map(statusOf).sort()).toEqual(["kudos-given", "kudos-limit"]);
    expect(await tour.rows("SELECT COUNT(*) AS n FROM auth_reputation WHERE source = 'kudos'")).toEqual([{ n: 10 }]);
    expect(await auditLog(tour, "auth:kudos:give")).toHaveLength(1);
  });
});

describe("a user page's reputation", () => {
  // Proves story 28: an account's user page shows its score to anyone, and its next threshold to the account alone.
  it("answers the page owner's score, and their next threshold only to them", async () => {
    const first = await site();
    const root = await signUp(first, ADMIN, "root");
    const ada = await signUp(first, 2, "ada");
    await first.post("people/role", root, { name: "editors" });
    await first.post("reputation/threshold", root, { role: "editors", score: "20" });
    await postReputation(first.env, { kind: "page", to: { identity: "github:2" }, ref: "test:commit:1" });
    // Ada has written her page since, and the site rebuilt.
    const tour = await site({ db: first.db, userPages: { ada: "/notes/users/ada/" } });
    const standing = async (page: string, cookies: string[] = []) =>
      (await tour.request(`${AUTH}/reputation/?page=${encodeURIComponent(page)}`, { cookies })).json();

    expect(await standing("/notes/users/ada/")).toEqual({ handle: "ada", score: 5 });
    expect(await standing("/notes/users/ada/", root)).toEqual({ handle: "ada", score: 5 });
    expect(await standing("/notes/users/ada/", ada)).toEqual({ handle: "ada", score: 5, next: { role: "editors", score: 20 } });
    expect(await standing("/notes/users/root/")).toBeNull();
    expect(await standing("/notes/garden/")).toBeNull();
  });
});

describe("an account's standing, for plugins", () => {
  // Proves a plugin finds an account by any handle it has held, under its current one, with the user page it left
  // under an old handle and its reputation; and the account page leaves plugins room to link the account's activity.
  it("finds an account by an old handle, with its user page and reputation", async () => {
    const pages: Record<string, string> = {};
    const tour = await site({ userPages: pages });
    const root = await signUp(tour, ADMIN, "root");
    const ada = await signUp(tour, 2, "ada");
    await tour.post("people/role", root, { name: "editors" });
    await tour.post("reputation/threshold", root, { role: "editors", score: "20" });
    await postReputation(tour.env, { kind: "page", to: { identity: "github:2" }, ref: "test:commit:1" });
    // Ada wrote her page as ada, the site rebuilt, and she has since become lovelace.
    pages.ada = "/notes/users/ada/";
    await tour.post("account/profile", ada, { name: "Ada Lovelace", handle: "lovelace" });

    expect(await findStanding("ada", tour.env)).toEqual({
      id: await tour.id("lovelace"),
      handle: "lovelace",
      name: "Ada Lovelace",
      avatarUrl: "https://github.com/ada.png",
      userPage: "/notes/users/ada/",
      standing: { score: 5, next: { role: "editors", score: 20 } },
    });
    expect(await findStanding("nobody", tour.env)).toBeUndefined();
    expect(await findStanding("ada", {})).toBeUndefined();
    expect([userPageOf("ada"), userPageOf("lovelace")]).toEqual(["/notes/users/ada/", undefined]);
    expect((await tour.page("/notes/-/account/", ada))?.html)
      .toContain('<p class="sv-account-activity" data-svartz-region="account-activity" data-svartz-handle="lovelace"></p>');
  });
});

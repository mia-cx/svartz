import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountId, ADA, ALAN, createDatabase, createSite, grant, GRACE, ORIGIN, seedComment, seedSubmission, signIn, SUBMISSIONS, type Database, type Site,
  type SiteOptions,
} from "./harness";

const ENDPOINT = "/notes/_svartz/moderation";
const REPORTS = "/notes/-/dashboard/moderation/reports/";
const SUSPENSIONS = "/notes/-/dashboard/moderation/suspensions/";
const AUDIT = "/notes/-/dashboard/moderation/audit/";
const NOW = new Date("2026-11-19T12:00:00.000Z");

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/**
 * A site where Ada reads, Alan moderates (reports, suspensions and the audit log) and Grace wrote comment c1 on garden.
 * The clock stands at {@link NOW} until a test moves it.
 */
async function moderated(options: SiteOptions = {}) {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const { db, dispose } = await createDatabase();
  disposers.push(dispose);
  const site = createSite(db, options);
  const people = { ada: await signIn(site, ADA), alan: await signIn(site, ALAN), grace: await signIn(site, GRACE) };
  for (const permission of ["moderation:reports:read", "moderation:accounts:write", "moderation:audit:read"]) await grant(db, "alan", permission);
  await seedComment(site, db, GRACE);
  return { db, site, ...people };
}

const post = (site: Site, cookie: string, path: string, form: Record<string, string> = {}, origin = ORIGIN) =>
  site.fetch(path, { method: "POST", headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });

const suspendGrace = (site: Site, cookie: string, form: Record<string, string> = {}, origin?: string) =>
  post(site, cookie, `${ENDPOINT}/accounts/suspend/`, { handle: "grace", duration: "day", reason: "Spammed the garden.", returnTo: `${SUSPENSIONS}?handle=grace`, ...form }, origin);

/** A plugin page as `cookie`'s holder sees it; `undefined` for the 404. */
async function html(site: Site, path: string, cookie: string) {
  const result = await site.page(path, cookie);
  return result && !("redirect" in result) ? result.html : undefined;
}

/** Comment on garden through annotations, as `cookie`'s holder: its status says whether annotations' `can()` let them. */
const comment = (site: Site, cookie: string) => site.fetch("/notes/_svartz/annotations/", {
  method: "POST",
  headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
  body: JSON.stringify({ kind: "comment", page: "garden", anchor: { exact: "roses", prefix: "", suffix: "", start: 0, end: 5 }, body: "Hello." }),
});

const audited = async (db: Database) => (await db.prepare("SELECT actor_handle, action, target, detail FROM auth_audit ORDER BY id").all()).results;
const suspensions = async (db: Database) => (await db.prepare("SELECT reason, ends_at FROM auth_suspensions").all()).results;
/** The `action` and hidden `returnTo` of the form posting to `route` in `page`, as a browser would send them. */
function formOf(page: string, route: string) {
  const form = new RegExp(`<form[^>]*action="([^"]*${route})"[\\s\\S]*?name="returnTo" value="([^"]*)"`).exec(page);
  const unescape = (text: string) => text.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  return form && { action: unescape(form[1]!), returnTo: unescape(form[2]!) };
}

describe("suspending from a report", () => {
  // Proves the whole path: a report's Suspend, the form, the audited write, another plugin treating the account as a
  // guest at once, and the suspension ending by time alone.
  it("takes the account's rights on its next request, on the record, and gives them back when its time passes", async () => {
    const { db, site, ada, alan, grace } = await moderated();
    const filed = await site.fetch(`${ENDPOINT}/reports/`, {
      method: "POST", headers: { cookie: ada, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ target: { kind: "account", id: "grace" }, reason: "Spam." }),
    });
    const { report: { id } } = await filed.json() as { report: { id: string } };
    expect((await comment(site, grace)).status).toBe(201);

    const queue = await html(site, REPORTS, alan);
    const link = new RegExp(`href="(${SUSPENSIONS.replaceAll("/", "\\/")}[^"]+)"[^>]*>Suspend @grace<`).exec(queue!)![1]!.replaceAll("&#38;", "&");
    expect(new URL(link, ORIGIN).searchParams.get("returnTo")).toBe(`${REPORTS}#report-${id}`);
    const page = await html(site, link, alan);
    expect(page).toContain('<a href="/notes/-/dashboard/moderation/reports/#report-');
    const form = formOf(page!, "/accounts/suspend/")!;
    const suspended = await post(site, alan, form.action, { handle: "grace", duration: "day", reason: "Spammed <b>the garden</b>.", returnTo: form.returnTo });

    expect(suspended.status).toBe(303);
    expect(suspended.headers.get("location")).toBe(`${SUSPENSIONS}?handle=grace&returnTo=${encodeURIComponent(`${REPORTS}#report-${id}`)}&status=suspended`);
    expect(await audited(db)).toEqual([{
      actor_handle: "alan", action: "auth:account:suspend", target: "account:grace",
      detail: JSON.stringify({ reason: "Spammed <b>the garden</b>.", until: "2026-11-20T12:00:00.000Z" }),
    }]);
    expect((await comment(site, grace)).status).toBe(401);
    expect((await comment(site, ada)).status).toBe(201);
    const shown = await html(site, suspended.headers.get("location")!, alan);
    expect(shown).toContain("@grace is suspended.");
    expect(shown).toContain("Suspended until <time");
    expect(shown).toContain("Spammed &#60;b&#62;the garden&#60;/b&#62;.");

    vi.setSystemTime(new Date("2026-11-20T12:00:01.000Z"));
    expect((await comment(site, grace)).status).toBe(201);
  });

  it("offers to suspend the author of a reported comment, and nothing to a moderator who may not suspend", async () => {
    const { db, site, ada, alan } = await moderated();
    await site.fetch(`${ENDPOINT}/reports/`, {
      method: "POST", headers: { cookie: ada, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ target: { kind: "annotation", id: "c1" }, reason: "Spam." }),
    });

    expect(await html(site, REPORTS, alan)).toContain(">Suspend @grace</a>");
    await db.prepare("UPDATE auth_grants SET value = 'deny' WHERE permission = 'moderation:accounts:write'").run();
    expect(await html(site, REPORTS, alan)).not.toContain("Suspend @");
  });

  // Proves an edit names its account only through the site's record of saving it, never through the commit's trailer.
  it("offers to suspend whoever the site recorded saving a reported commit or submission, and nobody for a commit it has no record of", async () => {
    const { db, site, ada, alan } = await moderated();
    const grace = await accountId(db, "grace");
    const [recorded, unrecorded] = ["a".repeat(40), "b".repeat(40)];
    await seedSubmission(db, 0, undefined, { owner: grace, commit: recorded });
    await seedSubmission(db, 42, undefined, { owner: grace });
    // A commit anyone could push, whose trailer claims Grace's account.
    await db.prepare(`INSERT INTO submissions_commits (scope, sha, message, author_name, author_email, committer_email, trailer_account, committed_at, url)
      VALUES (?, ?, ?, 'Grace Hopper', 'grace@example.test', 'grace@example.test', ?, '2026-11-02T00:00:00.000Z', 'https://example.test')`)
      .bind(`${SUBMISSIONS.repo}:${SUBMISSIONS.root}`, unrecorded, `Edit garden\n\nSvartz-Account: ${grace}`, grace).run();
    for (const target of [{ kind: "commit", id: recorded }, { kind: "submission", id: "42" }, { kind: "commit", id: unrecorded }]) {
      await site.fetch(`${ENDPOINT}/reports/`, {
        method: "POST", headers: { cookie: ada, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ target, reason: "Vandalism." }),
      });
    }

    const items = (await html(site, REPORTS, alan))!.split('<li class="sv-moderation-report"').slice(1);
    const about = (text: string) => items.find((item) => item.includes(text));
    const [commit, submission, forged] = [about(`commit/${recorded}`), about("/pull/42"), about(`commit/${unrecorded}`)];
    expect(commit).toContain(">Suspend @grace</a>");
    expect(submission).toContain(">Suspend @grace</a>");
    expect(forged).toBeDefined();
    expect(forged).not.toContain("Suspend @");
  });
});

describe("the Suspensions panel", () => {
  // Proves the user page route in: for good, shown on the form's page and in the list, and lifted early on the record.
  it("suspends for good, shows the suspension, and lifts it once, on the record", async () => {
    const { db, site, alan, grace } = await moderated();
    const back = encodeURIComponent("/notes/users/grace/");

    await suspendGrace(site, alan, { duration: "for-good", returnTo: `${SUSPENSIONS}?handle=grace&returnTo=${back}` });

    expect(await suspensions(db)).toEqual([{ reason: "Spammed the garden.", ends_at: null }]);
    const page = await html(site, `${SUSPENSIONS}?handle=grace&returnTo=${back}`, alan);
    expect(page).toContain("Suspended for good");
    expect(page).toContain('<a href="/notes/users/grace/">Back</a>');
    expect(page).toContain(">Replace suspension</button>");
    expect(await html(site, SUSPENSIONS, alan)).toContain(`<a href="${SUSPENSIONS}?handle=grace">@grace</a>`);

    const lift = formOf(page!, "/accounts/lift/")!;
    const lifted = await post(site, alan, lift.action, { handle: "grace", returnTo: lift.returnTo });
    const again = await post(site, alan, lift.action, { handle: "grace", returnTo: lift.returnTo });

    expect(new URL(lifted.headers.get("location")!, ORIGIN).searchParams.get("status")).toBe("lifted");
    expect(new URL(again.headers.get("location")!, ORIGIN).searchParams.get("status")).toBe("not-suspended");
    expect((await audited(db)).map(({ action }) => action)).toEqual(["auth:account:suspend", "auth:account:lift"]);
    expect((await comment(site, grace)).status).toBe(201);
    expect(await html(site, SUSPENSIONS, alan)).toContain("No accounts are suspended.");
  });

  it("replaces a suspension in force with a new one", async () => {
    const { db, site, alan } = await moderated();
    await suspendGrace(site, alan, { duration: "for-good" });

    await suspendGrace(site, alan, { duration: "week", reason: "Calmer now." });

    expect(await suspensions(db)).toEqual([{ reason: "Calmer now.", ends_at: Date.parse("2026-11-26T12:00:00.000Z") }]);
  });

  it.each([
    ["an admin config names", { handle: "grace" }, { admins: [GRACE.id] }, "admin"],
    ["the moderator's own account", { handle: "alan" }, {}, "self"],
    ["an account nobody has", { handle: "nobody" }, {}, "not-found"],
    ["a length the form doesn't offer", { duration: "year" }, {}, "duration-invalid"],
    ["an empty reason", { reason: "   " }, {}, "reason-invalid"],
    ["a reason over 1,000 characters", { reason: "x".repeat(1001) }, {}, "reason-invalid"],
  ])("refuses %s, writing nothing", async (_, form: Record<string, string>, options: SiteOptions, status) => {
    const { db, site, alan } = await moderated(options);

    const refused = await suspendGrace(site, alan, form);

    expect(new URL(refused.headers.get("location")!, ORIGIN).searchParams.get("status")).toBe(status);
    expect(await suspensions(db)).toEqual([]);
    expect(await audited(db)).toEqual([]);
  });

  it("offers no form for an admin or for the moderator's own account", async () => {
    const { site, alan } = await moderated({ admins: [GRACE.id] });

    expect(await html(site, `${SUSPENSIONS}?handle=grace`, alan)).toContain("@grace is an admin, so they can't be suspended.");
    expect(await html(site, `${SUSPENSIONS}?handle=alan`, alan)).toContain("You can't suspend your own account.");
    expect(await html(site, `${SUSPENSIONS}?handle=grace`, alan)).not.toContain("/accounts/suspend/");
  });

  // Proves the gate: without the permission there's no panel, and the routes refuse whoever asks, from wherever.
  it("is only for moderators who may suspend, and its routes refuse everyone else and every other site", async () => {
    const { db, site, ada, alan } = await moderated();
    await db.batch([
      db.prepare("INSERT INTO auth_groups (name, display_name, created_at) VALUES ('gardeners', 'Gardeners', '2026-11-19T00:00:00.000Z')"),
      db.prepare(`INSERT INTO auth_group_members (group_name, account_id, owner, added_at)
        SELECT 'gardeners', id, 1, '2026-11-19T00:00:00.000Z' FROM auth_accounts WHERE handle = 'ada'`),
      db.prepare("INSERT INTO auth_group_links (group_name, object, linked_at) VALUES ('gardeners', 'vault:notes', '2026-11-19T00:00:00.000Z')"),
    ]);

    expect(await html(site, `${SUSPENSIONS}?handle=grace`, ada)).toBeUndefined();
    expect((await suspendGrace(site, ada)).status).toBe(403);
    expect((await suspendGrace(site, "")).status).toBe(401);
    expect((await suspendGrace(site, alan, {}, "https://evil.test")).status).toBe(403);
    expect((await post(site, alan, `${ENDPOINT}/accounts/lift/`, { handle: "grace" }, "https://evil.test")).status).toBe(403);
    expect(await suspensions(db)).toEqual([]);
  });

  it.each(["https://evil.test/", "//evil.test/", "/a/..//evil.test/"])("goes back to the form, not to %s", async (returnTo) => {
    const { site, alan } = await moderated();

    const suspended = await suspendGrace(site, alan, { returnTo });

    expect(suspended.headers.get("location")).toBe(`${SUSPENSIONS}?handle=grace&status=suspended`);
  });

  // Proves a suspension holds against the sessions it caught: a suspended moderator can't undo it, or act at all.
  it("leaves a suspended moderator no way to lift their own suspension", async () => {
    const { db, site, ada, alan } = await moderated();
    await grant(db, "ada", "moderation:accounts:write");
    await post(site, ada, `${ENDPOINT}/accounts/suspend/`, { handle: "alan", duration: "day", reason: "Abused the tools.", returnTo: SUSPENSIONS });

    expect((await post(site, alan, `${ENDPOINT}/accounts/lift/`, { handle: "alan" })).status).toBe(401);
    expect(await html(site, SUSPENSIONS, alan)).toBeUndefined();
    expect(await suspensions(db)).toEqual([{ reason: "Abused the tools.", ends_at: Date.parse("2026-11-20T12:00:00.000Z") }]);
  });

  it("tells the user page's script whether the reader may suspend", async () => {
    const { site, ada, alan } = await moderated();
    const viewer = async (cookie: string) => (await site.fetch(`${ENDPOINT}/viewer/`, { headers: { cookie } })).json();

    expect([await viewer(alan), await viewer(ada), await viewer("")]).toEqual([{ suspends: true }, { suspends: false }, { suspends: false }]);
  });
});

describe("the Audit log panel", () => {
  /** Append `count` entries by `actor` on `target`, each a second apart from the last. */
  async function seed(db: Database, count: number, actor: string, target: string, detail: object = {}) {
    const { results: [account] } = await db.prepare("SELECT id FROM auth_accounts WHERE handle = ?").bind(actor).all<{ id: string }>();
    for (let index = 0; index < count; index++) {
      await db.prepare("INSERT INTO auth_audit (at, actor_id, actor_handle, action, target, detail) VALUES (?, ?, ?, 'auth:grant:set', ?, ?)")
        .bind(new Date(NOW.getTime() + index * 1000).toISOString(), account!.id, actor, target, JSON.stringify(detail)).run();
    }
  }
  const entries = (page: string | undefined) => [...page!.matchAll(/<li class="sv-moderation-report">/g)].length;

  // Proves the gate: the panel shows nothing, not even an empty log, to a viewer without moderation:audit:read.
  it("is only for viewers who may read the log", async () => {
    const { site, ada, alan } = await moderated();
    await suspendGrace(site, alan);

    expect(await html(site, AUDIT, ada)).toBeUndefined();
    expect(await html(site, AUDIT, "")).toBeUndefined();
    expect(await html(site, AUDIT, alan)).toContain("auth:account:suspend");
  });

  it("lists every plugin's entries, newest first, with who, what, on what, when and the detail, escaped", async () => {
    const { db, site, ada, alan } = await moderated();
    const filed = await site.fetch(`${ENDPOINT}/reports/`, {
      method: "POST", headers: { cookie: ada, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ target: { kind: "page", id: "garden" }, reason: "Spam." }),
    });
    const { report: { id } } = await filed.json() as { report: { id: string } };
    await grant(db, "alan", "annotations:comments:delete");
    await post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`);
    await post(site, alan, "/notes/_svartz/annotations/c1/hide/", { returnTo: REPORTS });
    await suspendGrace(site, alan, { reason: "<img src=x onerror=alert(1)>" });

    const page = await html(site, AUDIT, alan);

    expect([...page!.matchAll(/<code class="sv-moderation-action">([^<]+)<\/code>/g)].map((match) => match[1]))
      .toEqual(["auth:account:suspend", "annotations:comment:hide", "moderation:report:resolve"]);
    expect(page).toContain(`<a href="${AUDIT}?actor=alan">@alan</a> on <a href="${AUDIT}?target=account%3Agrace"><code>account:grace</code></a>`);
    expect(page).toContain('<time datetime="2026-11-19T12:00:00.000Z">Nov 19, 2026, 12:00 PM UTC</time>');
    expect(page).toContain("<dt>reason</dt><dd>&#60;img src=x onerror=alert(1)&#62;</dd>");
    expect(page).not.toContain("<img src=x");
  });

  it("filters by who, under any handle they held, and by target, as links", async () => {
    const { db, site, alan } = await moderated();
    await seed(db, 2, "alan", "page:notes/garden");
    await seed(db, 1, "ada", "page:notes/garden");
    await seed(db, 1, "alan", "role:editors");
    await db.prepare("UPDATE auth_accounts SET handle = 'turing' WHERE handle = 'alan'").run();
    await db.prepare("INSERT INTO auth_handles (handle, account_id, created_at) SELECT 'turing', id, ? FROM auth_accounts WHERE handle = 'turing'").bind(NOW.toISOString()).run();

    expect(entries(await html(site, `${AUDIT}?actor=turing`, alan))).toBe(3);
    expect(entries(await html(site, `${AUDIT}?actor=%40Alan`, alan))).toBe(3);
    expect(entries(await html(site, `${AUDIT}?target=page%3Anotes%2Fgarden`, alan))).toBe(3);
    expect(entries(await html(site, `${AUDIT}?actor=ada&target=page%3Anotes%2Fgarden`, alan))).toBe(1);
    expect(await html(site, `${AUDIT}?actor=nobody`, alan)).toContain("No entries match.");
  });

  it("pages through the log 50 at a time, and refuses a cursor it can't read", async () => {
    const { db, site, alan } = await moderated();
    await seed(db, 51, "alan", "page:notes/garden");

    const first = await html(site, AUDIT, alan);
    const older = /href="([^"]+)">Older entries</.exec(first!)![1]!.replaceAll("&#38;", "&");
    const second = await html(site, older, alan);

    expect([entries(first), entries(second)]).toEqual([50, 1]);
    expect(second).toContain(">Newest entries</a>");
    expect(second).not.toContain("Older entries");
    expect(await html(site, `${AUDIT}?before=0`, alan)).toBeUndefined();
    expect(await html(site, `${AUDIT}?before=x`, alan)).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADA, ALAN, createDatabase, createSite, grant, GRACE, ORIGIN, seedComment, seedSubmission, signIn, type Database, type Site, type SiteOptions,
} from "./harness";

const ENDPOINT = "/notes/_svartz/moderation";
const PANEL = "/notes/-/dashboard/moderation/reports/";
const SHA = "3a1f9c0e5b7d2468ace013579bdf2468ace01357";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/**
 * A site where Ada reads, Alan handles reports, and Grace wrote comment c1 on garden. Everyone has an account; only Alan
 * holds `moderation:reports:read`.
 */
async function moderated(options: SiteOptions = {}) {
  const { db, dispose } = await createDatabase();
  disposers.push(dispose);
  const site = createSite(db, options);
  const people = { ada: await signIn(site, ADA), alan: await signIn(site, ALAN), grace: await signIn(site, GRACE) };
  await grant(db, "alan", "moderation:reports:read");
  if (options.annotations !== false) await seedComment(site, db, GRACE);
  return { db, site, ...people };
}

const report = (site: Site, cookie: string, target: unknown, reason: unknown = "Spam.", origin = ORIGIN) =>
  site.fetch(`${ENDPOINT}/reports/`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({ target, reason }),
  });

const post = (site: Site, cookie: string, path: string, form: Record<string, string> = {}, origin = ORIGIN) =>
  site.fetch(path, { method: "POST", headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });

/** The panel as `cookie`'s holder sees it, as a document; `undefined` when they get the 404. */
async function panel(site: Site, cookie: string, query = "") {
  const result = await site.page(`${PANEL}${query}`, cookie);
  if (!result || "redirect" in result) return undefined;
  return result.html;
}

/** Every stored report; none before a request has created the table. */
async function reports(db: Database) {
  const { results: [table] } = await db.prepare("SELECT name FROM sqlite_schema WHERE name = 'moderation_reports'").all();
  if (!table) return [];
  return (await db.prepare("SELECT target_kind, target_id, reason, state, closed_by FROM moderation_reports ORDER BY created_at").all()).results;
}
const audited = async (db: Database) => (await db.prepare("SELECT actor_handle, action, target, detail FROM auth_audit ORDER BY id").all()).results;

describe("a report's life", () => {
  // Proves the lifecycle: a reader reports, a moderator sees it with its context and resolves it, and the log says who.
  it("goes from a reader to the queue, and out of it once a moderator resolves it, on the record", async () => {
    const { db, site, ada, alan } = await moderated();

    const filed = await report(site, ada, { kind: "page", id: "garden" }, "  Vandalised:\nthe intro is gone.  ");

    expect(filed.status).toBe(201);
    const { report: { id } } = await filed.json() as { report: { id: string } };
    const queue = await panel(site, alan);
    expect(queue).toContain(`id="report-${id}"`);
    expect(queue).toContain('<a href="/notes/garden/">Garden</a>');
    expect(queue).toContain("Vandalised:\nthe intro is gone.");
    expect(queue).toContain(`action="${ENDPOINT}/reports/${id}/resolve/"`);

    const resolved = await post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`);

    expect(resolved.status).toBe(303);
    expect(resolved.headers.get("location")).toBe(`${PANEL}?status=resolved#report-${id}`);
    expect(await reports(db)).toEqual([{ target_kind: "page", target_id: "garden", reason: "Vandalised:\nthe intro is gone.", state: "resolved", closed_by: "alan" }]);
    expect(await audited(db)).toEqual([{
      actor_handle: "alan", action: "moderation:report:resolve", target: `report:${id}`, detail: JSON.stringify({ vault: "notes", target: "page:garden" }),
    }]);
    expect(await panel(site, alan)).toContain("No open reports.");
    expect(await panel(site, alan, "?view=closed")).toMatch(/Resolved by @alan, <time/);
  });

  it("is dismissed when there's nothing to do, and closes once, whoever is second", async () => {
    const { db, site, ada, alan } = await moderated();
    const { report: { id } } = await (await report(site, ada, { kind: "account", id: "grace" })).json() as { report: { id: string } };

    expect((await post(site, alan, `${ENDPOINT}/reports/${id}/dismiss/`)).headers.get("location")).toBe(`${PANEL}?status=dismissed#report-${id}`);
    const second = await post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`);

    expect(second.headers.get("location")).toBe(`${PANEL}?status=already-closed#report-${id}`);
    expect(await reports(db)).toEqual([expect.objectContaining({ state: "dismissed" })]);
    expect((await audited(db)).map(({ action }) => action)).toEqual(["moderation:report:dismiss"]);
  });

  // Proves the write decides a race: both moderators read the report open, and only one closes it on the record.
  it.each(["SVARTZ_DB", "DB"])("closes once when resolve and dismiss arrive together, with reports in %s", async (database) => {
    const { db, dispose } = await createDatabase();
    disposers.push(dispose);
    // Holds each read of one report until two requests have read it, as when two moderators click at once.
    let waiting: Array<() => void> | undefined;
    const racing: Database = {
      batch: (statements) => db.batch(statements),
      prepare(query) {
        const statement = db.prepare(query);
        if (!/^SELECT .* FROM moderation_reports WHERE id = \?/.test(query)) return statement;
        return {
          ...statement,
          bind: (...values) => {
            const bound = statement.bind(...values);
            return {
              ...bound,
              all: async () => {
                if (waiting) {
                  const arrived = new Promise<void>((release) => waiting!.push(release));
                  if (waiting.length === 2) {
                    waiting.forEach((release) => release());
                    waiting = undefined;
                  }
                  await arrived;
                }
                return bound.all();
              },
            } as typeof bound;
          },
        };
      },
    };
    const site = createSite(racing, { database, annotations: false });
    const [ada, alan, grace] = [await signIn(site, ADA), await signIn(site, ALAN), await signIn(site, GRACE)];
    await grant(db, "alan", "moderation:reports:read");
    await grant(db, "grace", "moderation:reports:read");
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };

    waiting = [];
    const answers = await Promise.all([
      post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`),
      post(site, grace, `${ENDPOINT}/reports/${id}/dismiss/`),
    ]);

    const statuses = answers.map((answer) => new URL(answer.headers.get("location")!, ORIGIN).searchParams.get("status"));
    expect(statuses.filter((status) => status === "already-closed")).toHaveLength(1);
    const [stored] = await reports(db) as Array<{ state: string }>;
    expect(statuses).toContain(stored!.state);
    expect((await audited(db)).map(({ action }) => action)).toEqual([`moderation:report:${stored!.state === "resolved" ? "resolve" : "dismiss"}`]);
  });

  it("keeps one open report per reader per target, and queues each reader's", async () => {
    const { db, site, ada, grace } = await moderated();

    const first = await (await report(site, ada, { kind: "page", id: "garden" })).json();
    const again = await (await report(site, ada, { kind: "page", id: "garden" }, "Still spam.")).json();
    await report(site, grace, { kind: "page", id: "garden" });

    expect(again).toEqual(first);
    expect(await reports(db)).toHaveLength(2);
  });

  // Proves the moderator never learns who reported, so a moderator who is reported can't either.
  it("never shows who reported", async () => {
    const { site, ada, alan } = await moderated();
    await report(site, ada, { kind: "account", id: "alan" });

    const queue = await panel(site, alan);

    expect(queue).toContain("@alan");
    expect(queue).not.toMatch(/ada|Lovelace/i);
  });

  it("escapes everything readers wrote", async () => {
    const { site, ada, alan } = await moderated();
    await report(site, ada, { kind: "annotation", id: "c1" }, '<img src=x onerror="alert(1)">');

    const queue = await panel(site, alan);

    expect(queue).toContain("&#60;img src=x onerror=&#34;alert(1)&#34;&#62;");
    expect(queue).toContain("Cheap pills at &#60;a href=x&#62;spam&#60;/a&#62;");
    expect(queue).not.toContain("<img");
  });

  it("records in auth's log when reports live in another database", async () => {
    const { db, site, ada, alan } = await moderated({ database: "DB" });
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };

    expect((await post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`)).status).toBe(303);
    expect(await reports(db)).toEqual([expect.objectContaining({ state: "resolved" })]);
    expect(await audited(db)).toHaveLength(1);
  });

  // Proves a close and its entry land together in another database too: no entry, no close.
  it("leaves the report open when auth's log can't take the entry, with reports in another database", async () => {
    const { db, site, ada, alan } = await moderated({ database: "DB" });
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };
    await db.prepare("ALTER TABLE auth_audit RENAME TO auth_audit_gone").run();

    await expect(post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`)).rejects.toThrow(/auth_audit/);
    expect(await reports(db)).toEqual([expect.objectContaining({ state: "open", closed_by: null })]);
  });
});

describe("what can be reported", () => {
  it.each([
    ["a published page", { kind: "page", id: "garden" }, 201],
    ["a page the build didn't publish", { kind: "page", id: "secret" }, 404],
    ["a page named like a property every object has", { kind: "page", id: "constructor" }, 404],
    ["a page named toString", { kind: "page", id: "toString" }, 404],
    ["a page named __proto__", { kind: "page", id: "__proto__" }, 404],
    ["a comment", { kind: "annotation", id: "c1" }, 201],
    ["a comment this vault doesn't have", { kind: "annotation", id: "c9" }, 404],
    ["an account", { kind: "account", id: "grace" }, 201],
    ["an account nobody has", { kind: "account", id: "nobody" }, 404],
    ["a submission", { kind: "submission", id: "42" }, 201],
    ["a submission by anything but its number", { kind: "submission", id: "42; DROP" }, 400],
    ["a commit", { kind: "commit", id: SHA }, 201],
    ["a commit by a short SHA", { kind: "commit", id: SHA.slice(0, 7) }, 400],
    ["something else", { kind: "group", id: "x" }, 400],
    ["nothing", undefined, 400],
  ])("%s answers %i", async (_case, target, status) => {
    const { db, site, ada } = await moderated();

    expect((await report(site, ada, target)).status).toBe(status);
    expect(await reports(db)).toHaveLength(status === 201 ? 1 : 0);
  });

  it("refuses a comment a moderator hid", async () => {
    const { site, ada, alan, db } = await moderated();
    await grant(db, "alan", "annotations:comments:delete");
    await post(site, alan, "/notes/_svartz/annotations/c1/hide/", { returnTo: PANEL });

    expect((await report(site, ada, { kind: "annotation", id: "c1" })).status).toBe(404);
  });

  it.each([
    ["comments without annotations", { annotations: false }, { kind: "annotation", id: "c1" }],
    ["submissions without submissions", { submissions: false }, { kind: "submission", id: "42" }],
    ["commits without submissions", { submissions: false }, { kind: "commit", id: SHA }],
  ] as const)("refuses %s on the vault", async (_case, options, target) => {
    const { site, ada } = await moderated(options);

    expect((await report(site, ada, target)).status).toBe(400);
  });

  it("stores an account under its current handle", async () => {
    const { db, site, ada, grace } = await moderated();
    await post(site, grace, "/notes/_svartz/auth/account/profile/", { name: "Grace Hopper", handle: "amazing-grace" });

    expect((await report(site, ada, { kind: "account", id: "grace" })).status).toBe(201);
    expect(await reports(db)).toEqual([expect.objectContaining({ target_id: "amazing-grace" })]);
  });
});

describe("who may report", () => {
  it.each([
    ["from another site", { origin: "https://evil.test" }, 403],
    ["signed out", { signedOut: true }, 401],
  ] as const)("refuses a report %s", async (_case, { origin, signedOut }: { origin?: string; signedOut?: boolean }, status) => {
    const { db, site, ada } = await moderated();

    expect((await report(site, signedOut ? "" : ada, { kind: "page", id: "garden" }, "Spam.", origin)).status).toBe(status);
    expect(await reports(db)).toEqual([]);
  });

  it("refuses a reader a grant denies reporting", async () => {
    const { db, site, ada } = await moderated();
    await grant(db, "ada", "moderation:reports:write", "vault:notes", "deny");

    expect((await report(site, ada, { kind: "page", id: "garden" })).status).toBe(403);
  });

  it.each([
    ["no reason", "  ", 400, "Say what's wrong before sending."],
    ["a reason over 1,000 characters", "x".repeat(1001), 400, "Keep the reason to 1,000 characters."],
    ["a reason that isn't text", 42, 400, "Say what's wrong before sending."],
  ])("refuses %s", async (_case, reason, status, message) => {
    const { site, ada } = await moderated();

    const answer = await report(site, ada, { kind: "page", id: "garden" }, reason);

    expect(answer.status).toBe(status);
    expect(await answer.json()).toEqual({ error: "invalid_reason", message });
  });

  it("refuses a body over 16 KiB without reading it all", async () => {
    const { site, ada } = await moderated();

    expect((await report(site, ada, { kind: "page", id: "garden" }, "x".repeat(20_000))).status).toBe(413);
  });

  it("spends one of the reader's reports an hour on every attempt, and says when to come back", async () => {
    const { db, site, ada, grace } = await moderated({ reportsPerHour: 2 });
    const hour = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    vi.spyOn(Date, "now").mockReturnValue(hour + 30 * 60_000);
    await report(site, ada, { kind: "page", id: "nowhere" });
    await report(site, ada, { kind: "page", id: "garden" });

    const refused = await report(site, ada, { kind: "account", id: "grace" });

    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("1800");
    expect(await refused.json()).toEqual({ error: "rate_limited", message: "You've sent a lot of reports. Try again in 30 minutes.", retryAfter: 1800 });
    expect((await report(site, grace, { kind: "page", id: "garden" })).status).toBe(201);
    expect(await reports(db)).toHaveLength(2);
  });

  it("answers 503 on a site without accounts", async () => {
    const { db, dispose } = await createDatabase();
    disposers.push(dispose);
    const site = createSite(db, { accounts: false });

    expect((await report(site, "", { kind: "page", id: "garden" })).status).toBe(503);
  });
});

describe("the Reports panel", () => {
  // Proves the panel gate on the server: without moderation:reports:read there's no panel, and its routes refuse.
  it("is only for moderators, and so are its routes", async () => {
    const { db, site, ada } = await moderated();
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };

    expect(await panel(site, ada)).toBeUndefined();
    expect(await panel(site, "")).toBeUndefined();
    expect((await post(site, ada, `${ENDPOINT}/reports/${id}/resolve/`)).status).toBe(403);
    expect((await post(site, "", `${ENDPOINT}/reports/${id}/dismiss/`)).status).toBe(401);
    expect(await reports(db)).toEqual([expect.objectContaining({ state: "open" })]);
    expect(await audited(db)).toEqual([]);
  });

  it("refuses a resolve from another site", async () => {
    const { site, ada, alan } = await moderated();
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };

    expect((await post(site, alan, `${ENDPOINT}/reports/${id}/resolve/`, {}, "https://evil.test")).status).toBe(403);
  });

  // Proves vault isolation: another vault sharing the database neither lists nor closes this vault's reports.
  it("keeps each vault's reports to itself", async () => {
    const { db, site, ada } = await moderated();
    const { report: { id } } = await (await report(site, ada, { kind: "page", id: "garden" })).json() as { report: { id: string } };
    const docs = createSite(db, { vault: "docs" });
    const alan = await signIn(docs, ALAN);
    await grant(db, "alan", "moderation:reports:read", "site");

    expect(await panel(docs, alan)).toContain("No open reports.");
    expect((await post(docs, alan, `${ENDPOINT}/reports/${id}/resolve/`)).status).toBe(404);
  });

  // Proves hiding goes through annotations' own route and permission, and lands in the log; resolving stays separate.
  it("hides a comment through annotations for a moderator who may delete comments", async () => {
    const { db, site, ada, alan } = await moderated();
    const { report: { id } } = await (await report(site, ada, { kind: "annotation", id: "c1" })).json() as { report: { id: string } };
    expect(await panel(site, alan)).not.toContain("Hide comment");
    await grant(db, "alan", "annotations:comments:delete");

    const queue = await panel(site, alan);
    const form = /<form method="post" action="([^"]+)"><input type="hidden" name="returnTo" value="([^"]+)">/.exec(queue!);
    expect(queue).toContain("Hide comment");
    expect(form?.[1]).toBe("/notes/_svartz/annotations/c1/hide/");

    const hidden = await post(site, alan, form![1]!, { returnTo: form![2]! });

    expect(hidden.headers.get("location")).toBe(`${PANEL}?status=hidden#report-${id}`);
    expect((await (await site.fetch("/notes/_svartz/annotations/?page=garden")).json() as { annotations: unknown[] }).annotations).toEqual([]);
    const after = await panel(site, alan, "?status=hidden");
    expect(after).toContain("Comment hidden.");
    expect(after).toContain('<span class="sv-account-tag">Hidden</span>');
    expect(after).not.toContain("Hide comment");
    expect(await reports(db)).toEqual([expect.objectContaining({ state: "open" })]);
    expect((await audited(db)).map(({ action }) => action)).toEqual(["annotations:comment:hide"]);
  });

  it("offers to close a submission through submissions only to a moderator who may review them", async () => {
    const { db, site, ada, alan } = await moderated();
    await seedSubmission(db, 42);
    const { report: { id } } = await (await report(site, ada, { kind: "submission", id: "42" })).json() as { report: { id: string } };
    expect(await panel(site, alan)).not.toContain("Close submission");
    await grant(db, "alan", "submissions:reviews:write");

    const queue = await panel(site, alan);

    expect(queue).toContain('<a href="https://github.com/wikiplace/wikiplace.live/pull/42">Pull request #42</a>');
    expect(queue).toContain(`action="/notes/_svartz/submissions/close/"><input type="hidden" name="number" value="42"><input type="hidden" name="returnTo" value="${PANEL}?status=submission-closed#report-${id}">`);
  });

  // Proves Close shows only where submissions' route would take it: the vault's own saves, not another vault's on the repository.
  it("offers Close only on a pull request this vault's submissions saved", async () => {
    const { db, site, ada, alan } = await moderated();
    await grant(db, "alan", "submissions:reviews:write");
    await seedSubmission(db, 43, "docs");
    await report(site, ada, { kind: "submission", id: "43" });
    await report(site, ada, { kind: "submission", id: "44" });

    const queue = await panel(site, alan);

    expect(queue).toContain("Pull request #43");
    expect(queue).toContain("Pull request #44");
    expect(queue).not.toContain("Close submission");
  });

  // Proves one stored report the panel can't describe never takes the queue down for every moderator.
  it("lists the whole queue when a stored report names an inherited key or its target can't be read", async () => {
    const { db, site, ada, alan } = await moderated();
    await report(site, ada, { kind: "page", id: "garden" });
    await report(site, ada, { kind: "annotation", id: "c1" });
    await db.prepare(`INSERT INTO moderation_reports (id, vault, target_kind, target_id, reason, reporter_id, created_at)
      VALUES ('00000000-0000-4000-8000-000000000000', 'notes', 'page', 'constructor', 'Stored before the check.', 'x', '2026-11-19T00:00:00.000Z')`).run();
    expect(await panel(site, alan, "?status=constructor")).toContain('<a href="/notes/garden/">Garden</a>');
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Annotations' identities table gone: reading the comment throws.
    await db.prepare("ALTER TABLE identities RENAME TO identities_gone").run();

    const queue = await panel(site, alan);

    expect(queue).toContain('<a href="/notes/garden/">Garden</a>');
    expect(queue).toContain('constructor <span class="sv-account-muted">(no longer on the site)</span>');
    expect(queue).toContain("Couldn't show what this report is about.");
    expect(queue?.match(/<li class="sv-moderation-report"/g)).toHaveLength(3);
  });

  it("shows a report whose comment is gone, or whose plugin left the vault, without its actions", async () => {
    const { db, site, ada, alan } = await moderated();
    await grant(db, "alan", "annotations:comments:delete");
    await report(site, ada, { kind: "annotation", id: "c1" });
    await db.prepare("DELETE FROM annotations").run();

    expect(await panel(site, alan)).toContain("A comment that has since been deleted");
    const without = createSite(db, { annotations: false });
    const queue = await panel(without, alan);
    expect(queue).toContain("A comment");
    expect(queue).not.toContain("Hide comment");
    expect(queue).toContain("Resolve");
  });
});

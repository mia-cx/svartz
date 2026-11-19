import { afterEach, expect, it } from "vitest";
import { accountId, ADA, ALAN, counting, createDatabase, createSite, grant, seedSubmission, signIn, type Database } from "./harness";

const REPORTS = "/notes/-/dashboard/moderation/reports/";
/** What a free Worker gets per request. */
const D1_CALLS_PER_REQUEST = 50;
/** Reports one view of the panel lists. */
const FULL_PAGE = 100;

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

/** Account `author<n>`, signed in once with GitHub, who wrote comment `c<n>` on page `p<n>`. */
function author(db: Database, n: number) {
  const at = "2026-11-01T00:00:00.000Z";
  const identity = `github:${10_000 + n}`;
  return [
    db.prepare("INSERT INTO auth_accounts (id, handle, name, created_at) VALUES (?, ?, ?, ?)").bind(`account-${n}`, `author${n}`, `Author ${n}`, at),
    db.prepare("INSERT INTO auth_handles (handle, account_id, created_at) VALUES (?, ?, ?)").bind(`author${n}`, `account-${n}`, at),
    db.prepare("INSERT INTO auth_identities (id, account_id, provider, name, handle, created_at, updated_at) VALUES (?, ?, 'github', ?, ?, ?, ?)")
      .bind(identity, `account-${n}`, `Author ${n}`, `author${n}`, at, at),
    db.prepare("INSERT INTO identities (id, provider, name, handle, updated_at) VALUES (?, 'github', ?, ?, ?)").bind(identity, `Author ${n}`, `author${n}`, at),
    db.prepare(`INSERT INTO annotations (id, vault, page, kind, body, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES (?, 'notes', ?, 'comment', 'Spam.', 'roses', '', '', 0, 5, ?, ?)`).bind(`c${n}`, `p${n}`, identity, at),
  ];
}

const report = (db: Database, reporter: string, n: number, kind: string, id: string) =>
  db.prepare(`INSERT INTO moderation_reports (id, vault, target_kind, target_id, reason, reporter_id, created_at)
    VALUES (?, 'notes', ?, ?, 'Spam.', ?, ?)`).bind(crypto.randomUUID(), kind, id, reporter, new Date(Date.UTC(2026, 10, 2, 0, n)).toISOString());

const sha = (n: number) => n.toString(16).padStart(40, "0");

// Proves the Reports panel reads what its reports are about in the same number of D1 calls for a full page as for one
// report of each kind, well inside a free Worker's 50, with every report still described and offering its actions.
it("costs the same D1 calls for a full page of reports as for a handful", async () => {
  const { db, dispose } = await createDatabase();
  disposers.push(dispose);
  const { database, calls } = counting(db);
  const site = createSite(database);
  await signIn(site, ADA);
  const alan = await signIn(site, ALAN);
  for (const permission of ["moderation:reports:read", "moderation:accounts:write", "annotations:comments:delete", "submissions:reviews:write"]) {
    await grant(db, "alan", permission);
  }
  // Migrates annotations' and moderation's schemas.
  await site.fetch("/notes/_svartz/annotations/?page=garden");
  await site.page(REPORTS, alan);
  const ada = await accountId(db, "ada");

  /** Reports `from` to `to` of a page: one of each kind per five, the rest comments by different authors. */
  async function fill(from: number, to: number) {
    for (let n = from; n < to; n++) {
      const kind = n % 20 < 4 ? ["account", "page", "commit", "submission"][n % 20]! : "annotation";
      if (kind === "commit") await seedSubmission(db, n, undefined, { owner: `account-${n}`, commit: sha(n) });
      if (kind === "submission") await seedSubmission(db, n, undefined, { owner: `account-${n}` });
      const target = { account: `author${n}`, page: `p${n}`, commit: sha(n), submission: String(n), annotation: `c${n}` }[kind];
      await db.batch([...author(db, n), report(db, ada, n, kind, target)]);
    }
  }
  async function costOfPanel() {
    await site.page(REPORTS, alan);
    calls.count = 0;
    const page = await site.page(REPORTS, alan);
    return { count: calls.count, html: page && "html" in page ? page.html : "" };
  }

  await fill(0, 5);
  const handful = await costOfPanel();
  await fill(5, FULL_PAGE);
  const full = await costOfPanel();

  expect(full.count).toBe(handful.count);
  expect(full.count).toBeLessThan(D1_CALLS_PER_REQUEST / 2);
  expect(full.html.match(/class="sv-moderation-report"/g)).toHaveLength(FULL_PAGE);
  expect(full.html).not.toContain("Couldn't show");
  // Every report but the pages' names an account to suspend; every comment can be hidden, every submission closed.
  expect(full.html.match(/>Suspend @author\d+</g)).toHaveLength(FULL_PAGE - FULL_PAGE / 20);
  expect(full.html.match(/>Hide comment</g)).toHaveLength(FULL_PAGE * 16 / 20);
  expect(full.html.match(/>Close submission</g)).toHaveLength(FULL_PAGE / 20);
});

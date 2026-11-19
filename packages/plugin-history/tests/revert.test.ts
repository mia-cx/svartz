/**
 * Reverting a page through history's `revert/` route, over Svartz's real server router, with the real auth and
 * submissions plugins on a Miniflare D1 and GitHub replayed: the commit it makes, what it records, what it takes back,
 * and every refusal.
 */
import { postReputation } from "@svartz/auth/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSha } from "../../plugin-submissions/src/github";
import {
  blobExchange,
  branchFor,
  commitExchanges,
  committerExchanges,
  HEAD_COMMIT,
  headExchange,
  SUBMISSION_ID,
} from "../../plugin-submissions/tests/github-exchanges";
import {
  ADA,
  ALAN,
  ALAN_PAGE,
  backfill,
  contentExchange,
  createSite,
  DIRECT_COMMIT,
  disposeSites,
  firstToken,
  GITHUB_WEB,
  GRACE,
  historyExchange,
  INSTALLATION_TOKEN,
  replayGitHub,
  REPO,
  rows,
  siteMessage,
  text,
  type Exchange,
  type TestCommit,
} from "./harness";

afterEach(async () => {
  await disposeSites();
  vi.unstubAllGlobals();
});

const ORIGIN = "https://wiki.example";
const HISTORY = "/wiki/-/history/guide/";
const REVERT = "/wiki/_svartz/history/revert/";
const GUIDE_PATH = "content/guide.md";
const GIT_AUTHOR = { name: "Grace Hopper", email: "grace@example.com", login: "grace" };
const START = "---\ntitle: Guide\n---\n\n# Guide\n\nStart here.\n";
const RESTORED = "---\ntitle: Guide\n---\n\n# Guide\n\nSet up the wiki.\n";
const VANDALISED = "---\ntitle: Guide\n---\n\n# Guide\n\nBuy cheap watches.\n";
const ADA_AUTHOR = { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" };

const git = (sha: string, at: number, message = "Edit the guide"): TestCommit =>
  ({ sha: sha.repeat(40), message, at, author: GIT_AUTHOR, committer: GITHUB_WEB, files: [GUIDE_PATH] });

/**
 * A wiki whose guide has five revisions, oldest first: `start` and `restored` from git; `grace` and `alan`, saves the
 * site recorded committing for those accounts; and `vandalised`, the head, a commit the site has no record of. Ada is
 * an admin. Grace's save earned 4 points; Alan's credit is still owed, its lines not counted yet.
 */
async function wiki() {
  const site = await createSite();
  const [ada, grace, alan] = [await site.signUp(ADA), await site.signUp(GRACE), await site.signUp(ALAN)];
  const start = git("0", -10, "Start the guide");
  const restored = git("a", 0);
  const byGrace = { ...git("b", 10), message: siteMessage("Tidied.", grace.id) };
  const byAlan = { ...git("d", 20), message: siteMessage("Reworded.", alan.id) };
  const vandalised = git("e", 30, "Improve the guide");
  await site.recordCommits(grace.id, [byGrace.sha]);
  await site.recordCommits(alan.id, [byAlan.sha]);
  await site.push([start, restored, byGrace, byAlan, vandalised]);
  await site.settle();
  await postReputation({ SVARTZ_DB: site.db }, { kind: "edit", to: { account: grace.id }, ref: `submissions:${REPO}:commit:${byGrace.sha}`, lines: 8 });
  return { site, ada, grace, alan, commits: { start, restored, byGrace, byAlan, vandalised } };
}
type Wiki = Awaited<ReturnType<typeof wiki>>;

/** The guide's changes as GitHub lists them, newest first. */
const listOf = ({ commits: c }: Wiki, ...newer: TestCommit[]) => [...newer, c.vandalised, c.byAlan, c.byGrace, c.restored, c.start];

/** Post the revert form as `cookie`'s reader. */
const revert = (site: Wiki["site"], cookie: string, fields: Record<string, string>, origin = ORIGIN) =>
  site.request(REVERT, { method: "POST", headers: { cookie, origin }, body: new URLSearchParams({ page: "/wiki/guide/", ...fields }) });

/** The message the revert of the guide to `sha`, made on 19 Nov 2026, commits with. */
const revertMessage = (sha: string, account: string, reason?: string) => {
  const named = `${sha.slice(0, 7)} (19 Nov 2026)`;
  return `Revert ${GUIDE_PATH} to ${named}\n\nReverted to ${named}${reason ? `: ${reason}` : "."}\n\nCo-authored-by: Ada Lovelace <583231+ada@users.noreply.github.com>\nSvartz-Account: ${account}`;
};

/** GitHub committing `markdown` over `current` as Ada: the App's bot, the head of `main`, the file's blob, the commit. */
const commitAsAda = async (markdown: string, current: string, message: string, moved: "ok" | "protected" = "ok"): Promise<Exchange[]> => [
  headExchange(),
  blobExchange(GUIDE_PATH, HEAD_COMMIT, await blobSha(current)),
  ...commitExchanges({ path: GUIDE_PATH, markdown, message, author: ADA_AUTHOR, moved }),
];

const query = async (site: Wiki["site"], sql: string, ...values: unknown[]) => (await site.db.prepare(sql).bind(...values).all()).results;

describe("reverting a page", () => {
  // Proves stories 26, 51 and 57 end to end: the moderator's form restores an earlier revision in one commit authored
  // as them, committed by the App over the blob they saw; the save is theirs in history and earns nothing; each save
  // since is taken back for the account the site's record names, and an unrecorded commit for nobody; one audit entry
  // records it. A second revert over the same changes takes nothing back twice, and reverts the first revert too.
  it("commits the earlier revision as the moderator, records it, takes back what the changes since earned, and audits it", async () => {
    const page = await wiki();
    const { site, ada, grace, alan, commits: c } = page;

    const diff = `${HISTORY}?from=${c.restored.sha}&to=${c.vandalised.sha}`;
    replayGitHub([
      firstToken,
      contentExchange(GUIDE_PATH, c.vandalised.sha, VANDALISED),
      contentExchange(GUIDE_PATH, c.restored.sha, RESTORED),
      historyExchange(GUIDE_PATH, listOf(page)),
    ], INSTALLATION_TOKEN);
    const form = await site.page(diff, { headers: { cookie: ada.cookie } });
    expect(text(form!.html)).toContain("Restore the page as it read at 19 Nov 2026, 10:00 UTC, undoing 3 changes.");
    expect(form!.html).toContain(`<input type="hidden" name="head" value="${c.vandalised.sha}">`);

    const github = replayGitHub([
      historyExchange(GUIDE_PATH, listOf(page)),
      ...committerExchanges,
      ...await commitAsAda(RESTORED, VANDALISED, revertMessage(c.restored.sha, ada.id, "Spam.")),
    ], INSTALLATION_TOKEN);
    const response = await revert(site, ada.cookie, { revision: c.restored.sha, head: c.vandalised.sha, to: c.vandalised.sha, reason: "  Spam.\n" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${HISTORY}?status=reverted`);
    expect(github.pending).toEqual([]);
    expect(await query(site, "SELECT owner, kind, commit_sha FROM submissions_edits WHERE commit_sha = ?", DIRECT_COMMIT))
      .toEqual([{ owner: `account:${ada.id}`, kind: "commit", commit_sha: DIRECT_COMMIT }]);
    expect(await query(site, "SELECT k.edit_id FROM submissions_credits k JOIN submissions_edits e ON e.id = k.edit_id WHERE e.commit_sha = ?", DIRECT_COMMIT)).toEqual([]);
    const reversals = [
      { account_id: grace.id, ref: `submissions:${REPO}:commit:${c.byGrace.sha}`, points: -4 },
      // Its lines aren't counted yet: once they are, it scores nothing.
      { account_id: alan.id, ref: `submissions:${REPO}:commit:${c.byAlan.sha}`, points: 0 },
    ];
    expect(await query(site, "SELECT account_id, ref, points FROM auth_reputation WHERE source = 'reversal' ORDER BY id")).toEqual(reversals);
    expect((await query(site, "SELECT actor_handle, target, detail FROM auth_audit WHERE action = 'history:page:revert'"))
      .map((entry) => ({ ...entry, detail: JSON.parse(entry.detail as string) }))).toEqual([{
      actor_handle: "ada",
      target: "page:wiki/guide",
      detail: { restored: c.restored.sha, replaced: c.vandalised.sha, commit: DIRECT_COMMIT, reason: "Spam." },
    }]);

    const reverted: TestCommit = { sha: DIRECT_COMMIT, message: revertMessage(c.restored.sha, ada.id, "Spam."), at: 40, author: ADA_AUTHOR, files: [GUIDE_PATH] };
    await site.push([reverted]);
    replayGitHub([historyExchange(GUIDE_PATH, listOf(page, reverted)), ...backfill(listOf(page, reverted))], INSTALLATION_TOKEN);
    const history = await site.page(`${HISTORY}?status=reverted`, { headers: { cookie: ada.cookie } });
    await site.settle();
    expect(text(history!.html)).toContain("Page reverted. It shows the restored revision once the site rebuilds.");
    expect(rows(history)[0]).toBe("19 Nov 2026, 10:40 UTC Ada Lovelace @ada Reverted to aaaaaaa (19 Nov 2026): Spam.");

    replayGitHub([
      historyExchange(GUIDE_PATH, listOf(page, reverted)),
      contentExchange(GUIDE_PATH, c.start.sha, START),
      contentExchange(GUIDE_PATH, DIRECT_COMMIT, RESTORED),
      ...await commitAsAda(START, RESTORED, revertMessage(c.start.sha, ada.id)),
    ], INSTALLATION_TOKEN);
    const again = await revert(site, ada.cookie, { revision: c.start.sha, head: DIRECT_COMMIT, to: DIRECT_COMMIT });

    expect(again.headers.get("location")).toBe(`${HISTORY}?status=reverted`);
    expect(await query(site, "SELECT account_id, ref, points FROM auth_reputation WHERE source = 'reversal' ORDER BY id")).toEqual(reversals);
  });

  // Proves the permission gates the action: an admin sees Revert beside every change but the newest, a signed-in reader
  // and a user page's own owner see none, and a page grant shows it on that page.
  it("offers Revert only to who holds history:reverts:write on the page, never for owning it", async () => {
    const page = await wiki();
    const { site, ada, grace, alan } = page;
    await site.addUserPage("alan", ALAN_PAGE.href);
    // The first view mints the App's token and starts the mirror's first poll, which backfills.
    let first = true;
    const reverts = async (cookie: string, path = HISTORY, list = listOf(page)) => {
      const listed = historyExchange(path === HISTORY ? GUIDE_PATH : `content/${ALAN_PAGE.path}`, list);
      replayGitHub(first ? [firstToken, listed, ...backfill(list)] : [listed], INSTALLATION_TOKEN);
      first = false;
      const html = (await site.page(path, { headers: { cookie } }))!.html;
      await site.settle();
      vi.unstubAllGlobals();
      return html.match(/>Revert to this</g)?.length ?? 0;
    };

    expect(await reverts(ada.cookie)).toBe(4);
    expect(await reverts(grace.cookie)).toBe(0);
    expect(await reverts(alan.cookie, "/wiki/-/history/users/alan/", [git("f", 0), git("1", -5)].map((commit) => ({ ...commit, files: [`content/${ALAN_PAGE.path}`] })))).toBe(0);
    await site.grant("grace", "history:reverts:write", "page:wiki/guide");
    expect(await reverts(grace.cookie)).toBe(4);
  });

  // Proves the route itself refuses, before asking GitHub anything: a reader without the permission, a user page's
  // owner, a post from another site, and a page this vault doesn't publish.
  it("refuses whoever may not revert the page, and posts from another site", async () => {
    const page = await wiki();
    const { site, ada, grace, alan, commits: c } = page;
    await site.addUserPage("alan", ALAN_PAGE.href);
    const github = replayGitHub([], INSTALLATION_TOKEN);
    const fields = { revision: c.restored.sha, head: c.vandalised.sha, to: c.vandalised.sha };

    expect((await revert(site, grace.cookie, fields)).status).toBe(403);
    expect((await revert(site, alan.cookie, { ...fields, page: ALAN_PAGE.href })).status).toBe(403);
    expect((await revert(site, ada.cookie, fields, "https://evil.example")).status).toBe(403);
    expect((await revert(site, ada.cookie, { ...fields, page: "/wiki/secret/" })).status).toBe(404);
    expect(github.requests).toEqual([]);
    expect(await query(site, "SELECT 1 FROM auth_audit WHERE action = 'history:page:revert'")).toEqual([]);
  });

  // Proves a revert never overwrites what the moderator didn't see, and commits nothing where it can't: a page that
  // changed since, a revision that isn't one of the page's latest changes (another repository's, say), one that wasn't
  // public, one whose frontmatter would take a page the moderator can't revert, and a page already reading so.
  it.each([
    ["the page changed since the form loaded", { head: "d" }, [], "changed"],
    ["a revision that isn't one of the page's changes", { revision: "9" }, [], "too-old"],
    ["a revision that was a draft", {}, [["a", "---\ndraft: true\n---\n\nSet up the wiki.\n"], ["e", VANDALISED]], "hidden"],
    ["a revision that takes the hidden page's route", {}, [["a", "---\naliases: [secret]\n---\n\nSet up the wiki.\n"], ["e", VANDALISED]], "route"],
    ["a page that already reads so", {}, [["a", VANDALISED], ["e", VANDALISED]], "unchanged"],
  ] as const)("refuses %s", async (_case, fields, contents, status) => {
    const page = await wiki();
    const { site, grace, commits: c } = page;
    await site.grant("grace", "history:reverts:write", "page:wiki/guide");
    const github = replayGitHub([
      firstToken,
      historyExchange(GUIDE_PATH, listOf(page)),
      ...contents.map(([sha, markdown]) => contentExchange(GUIDE_PATH, sha.repeat(40), markdown)),
    ], INSTALLATION_TOKEN);
    const sha = (value: string | undefined, fallback: string) => (value ? value.repeat(40) : fallback);
    const response = await revert(site, grace.cookie, {
      revision: sha("revision" in fields ? fields.revision : undefined, c.restored.sha),
      head: sha("head" in fields ? fields.head : undefined, c.vandalised.sha),
      to: c.vandalised.sha,
    });

    expect(response.headers.get("location")).toBe(`${HISTORY}?from=${sha("revision" in fields ? fields.revision : undefined, c.restored.sha)}&to=${c.vandalised.sha}&revert=${status}#sv-history-revert`);
    expect(github.pending).toEqual([]);
    expect(await query(site, "SELECT 1 FROM auth_audit WHERE action = 'history:page:revert'")).toEqual([]);
    expect(await query(site, "SELECT 1 FROM auth_reputation WHERE source = 'reversal'")).toEqual([]);
  });

  // Proves a branch whose rules refuse the site's commits gets no pull request in its place: the revert says why, and
  // nothing is recorded as made or taken back.
  it("says the repository's rules refuse it, and opens no pull request", async () => {
    const page = await wiki();
    const { site, ada, commits: c } = page;
    const github = replayGitHub([
      firstToken,
      historyExchange(GUIDE_PATH, listOf(page)),
      contentExchange(GUIDE_PATH, c.restored.sha, RESTORED),
      contentExchange(GUIDE_PATH, c.vandalised.sha, VANDALISED),
      ...committerExchanges,
      ...await commitAsAda(RESTORED, VANDALISED, revertMessage(c.restored.sha, ada.id), "protected"),
      // The branch stayed put, so a rule refused it.
      headExchange(),
    ], INSTALLATION_TOKEN);
    const response = await revert(site, ada.cookie, { revision: c.restored.sha, head: c.vandalised.sha, to: c.vandalised.sha });

    expect(response.headers.get("location")).toContain("&revert=protected#sv-history-revert");
    expect(github.pending).toEqual([]);
    expect(await query(site, "SELECT 1 FROM submissions_edits WHERE commit_sha = ?", DIRECT_COMMIT)).toEqual([]);
    expect(await query(site, "SELECT 1 FROM auth_reputation WHERE source = 'reversal'")).toEqual([]);
  });
});

describe("reverting a submission the mirror doesn't know merged yet", () => {
  const MERGE: TestCommit = {
    sha: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    message: "Merge pull request #42\n\nEdit content/guide.md",
    at: 40,
    author: GIT_AUTHOR,
    committer: GITHUB_WEB,
    files: [GUIDE_PATH],
  };
  /** Pull request #42, merged as {@link MERGE}, as GitHub's list of pull requests shows it. */
  const MERGED_PULL = {
    number: 42,
    state: "closed",
    title: "Edit content/guide.md",
    user: { login: "wikiplace-editor[bot]", id: 41_898_282, type: "Bot" },
    html_url: `https://github.com/${REPO}/pull/42`,
    head: { ref: branchFor("wiki-guide"), sha: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f" },
    base: { ref: "main", sha: HEAD_COMMIT },
    created_at: "2026-11-19T11:00:00Z",
    updated_at: "2026-11-19T11:40:00Z",
    closed_at: "2026-11-19T11:40:00Z",
    merged_at: "2026-11-19T11:40:00Z",
    merge_commit_sha: MERGE.sha,
  };

  /** A GitHub whose poll finds #42 merged, its merge commit changing 8 lines of the guide, and nothing else. */
  const pollingGitHub = () => vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/access_tokens")) return Response.json({ token: INSTALLATION_TOKEN, expires_at: "2099-01-01T00:00:00Z" }, { status: 201 });
    const path = url.pathname.slice(`/repos/${REPO}`.length);
    if (path === "/actions/runs") return Response.json({ total_count: 0, workflow_runs: [] });
    if (path === "/pulls") return Response.json([MERGED_PULL]);
    if (path === `/commits/${MERGE.sha}`) return Response.json({ sha: MERGE.sha, files: [{ filename: GUIDE_PATH, additions: 6, deletions: 2 }] });
    return Response.json([]);
  });

  // Proves a revert takes back a submission it undid even when the mirror learns of the merge only afterwards, by its
  // delivery or by the poll: GitHub, which history reads live, already listed the merge when the moderator reverted.
  // Otherwise the submission would earn its 4 points for content already undone.
  it.each(["delivery", "poll"] as const)("leaves it nothing to earn when its merge arrives by %s after the revert", async (arrives) => {
    const site = await createSite();
    const [ada, grace] = [await site.signUp(ADA), await site.signUp(GRACE)];
    await site.graceOpensPullRequest(grace);
    const restored = git("a", 0);
    await site.push([restored, MERGE]);
    await site.settle();

    const github = replayGitHub([
      firstToken,
      historyExchange(GUIDE_PATH, [MERGE, restored]),
      contentExchange(GUIDE_PATH, restored.sha, RESTORED),
      contentExchange(GUIDE_PATH, MERGE.sha, VANDALISED),
      ...committerExchanges,
      ...await commitAsAda(RESTORED, VANDALISED, revertMessage(restored.sha, ada.id)),
    ], INSTALLATION_TOKEN);
    const response = await revert(site, ada.cookie, { revision: restored.sha, head: MERGE.sha, to: MERGE.sha });
    expect(response.headers.get("location")).toBe(`${HISTORY}?status=reverted`);
    expect(github.pending).toEqual([]);

    pollingGitHub();
    if (arrives === "delivery") {
      await site.merged(MERGE.sha);
      await site.settle();
    }
    // Grace following her edit runs the poll, which counts the merge's lines, and settles reputation after it.
    await site.request(`/wiki/_svartz/submissions/status/?edit=${SUBMISSION_ID}`, { headers: { cookie: grace.cookie } });
    await site.settle();

    expect(await query(site, "SELECT merge_commit FROM submissions_pulls WHERE number = 42")).toEqual([{ merge_commit: MERGE.sha }]);
    expect(await query(site, "SELECT source, ref, points FROM auth_reputation WHERE account_id = ?", grace.id))
      .toEqual([{ source: "reversal", ref: `submissions:${REPO}:pull:42`, points: 0 }]);
  });
});

describe("a revert's cost", () => {
  /** A wiki whose guide was saved from the site `saves` times since its first revision, each by a different account. */
  async function savedOver(saves: number) {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const first = git("a", 0);
    const later: TestCommit[] = [];
    for (let n = 1; n <= saves; n++) {
      const editor = await site.signUp({ id: `github:${100 + n}`, provider: "github", name: `Editor ${n}`, handle: `editor${n}` });
      const sha = n.toString(16).padStart(40, "c");
      await site.recordCommits(editor.id, [sha]);
      later.unshift({ ...git("c", n), sha, message: siteMessage(`Save ${n}.`, editor.id) });
    }
    await site.push([first, ...[...later].reverse()]);
    await site.settle();
    replayGitHub([
      firstToken,
      historyExchange(GUIDE_PATH, [...later, first]),
      contentExchange(GUIDE_PATH, first.sha, RESTORED),
      contentExchange(GUIDE_PATH, later[0]!.sha, VANDALISED),
      ...committerExchanges,
      ...await commitAsAda(RESTORED, VANDALISED, revertMessage(first.sha, ada.id)),
    ], INSTALLATION_TOKEN);
    site.d1.count = 0;
    const response = await revert(site, ada.cookie, { revision: first.sha, head: later[0]!.sha, to: later[0]!.sha });
    expect(response.headers.get("location")).toBe(`${HISTORY}?status=reverted`);
    expect(await query(site, "SELECT COUNT(*) AS n FROM auth_reputation WHERE source = 'reversal'")).toEqual([{ n: saves }]);
    return site.d1.count;
  }

  // Proves a revert stays inside a free Worker's 50 D1 queries however many saves it takes back: it reads them in one
  // query and writes their reversals in one batch.
  it("costs the same D1 calls however many saves it takes back", async () => {
    const one = await savedOver(1);
    const six = await savedOver(6);

    expect(six).toBe(one);
    expect(six).toBeLessThanOrEqual(14);
  });
});

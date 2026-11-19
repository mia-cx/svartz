/**
 * The Submissions review panel and its routes, through Svartz's real server beside the real `auth` plugin on a real
 * D1 from Miniflare (`edits-harness.ts`). The mirror fills through signed webhook deliveries and the reconcile poll;
 * what each action sends GitHub is replayed exchange by exchange.
 */
import type { PageResult } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditsSite, ORIGIN, pullJson, REPO, REVIEW_PANEL, REVIEWS, seedReviews, sha, type EditsSite, type Viewer } from "./edits-harness";
import { HEAD_COMMIT, INSTALLATION_TOKEN, replayGitHub, type Exchange } from "./github-exchanges";

const API = `https://api.github.com/repos/${REPO}`;
const ROUTES = "/wiki/_svartz/submissions/review";
const { guide, paris } = REVIEWS;

const sites: EditsSite[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const site of sites.splice(0)) await site.dispose();
});

async function seeded(): Promise<EditsSite> {
  const site = await createEditsSite();
  sites.push(site);
  await seedReviews(site);
  return site;
}

/** What a reader sees of a page: its text, with entities as their characters. */
const text = (page: PageResult | null) => html(page).replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();
const html = (page: PageResult | null) => (page && "html" in page ? page.html : "");

/** Post `fields` to the review route `route` as `viewer`, from this site unless `origin` says otherwise. */
const post = (site: EditsSite, viewer: Viewer, route: string, fields: Record<string, string>, origin = ORIGIN) =>
  site.request(`${ROUTES}/${route}/`, { method: "POST", headers: { cookie: site.sessions[viewer], origin }, body: new URLSearchParams(fields) });

/** The audit log's entries for submissions, oldest first. */
const audited = async (site: EditsSite) => (await site.rows(
  "SELECT actor_handle, action, target, detail FROM auth_audit WHERE action LIKE 'submissions:%' ORDER BY id",
)).map((row) => ({ ...row, detail: JSON.parse(String(row.detail)) as unknown }));

/** GitHub's pull request `number`, its head now at `now`, and the files it changes, as every action reads them first. */
function inspection(number: number, files: unknown[], now: string): Exchange[] {
  const [branch, title] = number === guide.number ? [guide.branch, "Edit content/guide.md"] : [paris.branch, "Add the secret plans and Paris's history"];
  return [
    { request: { method: "GET", url: `${API}/pulls/${number}` }, response: { status: 200, json: pullJson(number, now, branch, { title, user: "octocat", at: "2026-11-19T10:00:00Z" }) } },
    { request: { method: "GET", url: `${API}/compare/${HEAD_COMMIT}...${now}?per_page=1` }, response: { status: 200, json: { status: "ahead", files } } },
  ];
}
const GUIDE_FILES = [{ filename: "content/guide.md", status: "modified", patch: "@@ -7 +7 @@\n-Set up the wiki.\n+Plant the wiki." }];
const PARIS_FILES = [
  { filename: "content/Places/Paris.md", status: "modified", patch: "@@ -1 +1,2 @@\n # Paris\n+Founded." },
  { filename: "content/private/plans.md", status: "added", patch: "@@ -0,0 +1 @@\n+The secret plans." },
];
const MOD_HEADER = "> [!NOTE]\n> Sent from wiki.test by Mo Derator (mod), reviewer.";
const ADA_HEADER = "> [!NOTE]\n> Sent from wiki.test by Ada Lovelace (ada), admin.";
const comment = (id: number, body: string, extra: Record<string, unknown> = {}) => ({
  id, body, user: { login: "wikiplace-editor[bot]" }, html_url: `https://github.com/${REPO}/pull/43#issuecomment-${id}`,
  created_at: "2026-11-19T12:00:00Z", updated_at: "2026-11-19T12:00:00Z", ...extra,
});

describe("the Submissions panel", () => {
  // Proves the gate and the list: reviewers see the vault's open submissions, newest activity first, each with who
  // sent it, its verdict and its comments; anyone without submissions:reviews:write gets no panel.
  it("lists open submissions to reviewers only", async () => {
    const site = await seeded();

    const listed = text(await site.page("mod", REVIEW_PANEL));

    expect(listed).toMatch(/^Dashboard Submissions Pull request #44 #44 · by octocat on GitHub · updated \w+ \d+, \d{4} · 1 comment In review Guide Edit · #43 · by Grace Hopper @grace · updated \w+ \d+, \d{4} · 1 comment In review$/);
    expect(await site.page("reader", REVIEW_PANEL)).toBeNull();
    expect(await site.page("grace", `${REVIEW_PANEL}${guide.number}/`)).toBeNull();
    expect(await site.page("mod", `${REVIEW_PANEL}?page=0`)).toBeNull();
  });

  // Proves the detail: the conversation, GitHub's diff with a form to comment on any line, the page rendered at the
  // head through the build's Markdown steps, and the forms that decide it, Close among them for the site's own.
  it("shows a submission's diff, rendered page and decisions", async () => {
    const site = await seeded();

    const view = await site.page("mod", `${REVIEW_PANEL}${guide.number}/`);

    expect(text(view)).toContain("Submissions Edit content/guide.md Edit · Open the page · Pull request #43 on GitHub Waiting for review. Changes guide.md");
    expect(html(view)).toContain('<input type="radio" name="at" value="LEFT:7" aria-label="Comment on removed line 7" required>');
    expect(html(view)).toContain('<input type="radio" name="at" value="RIGHT:7" aria-label="Comment on line 7" required>');
    expect(html(view)).toMatch(/<div class="sv-prose svartz-submissions-rendered"><h1 id="guide">Guide<.*<p>Plant the wiki\.<\/p><\/div>/s);
    expect(text(view)).toContain("On content/guide.md , line 7 octocat");
    for (const button of ["Comment on line", "Approve", "Request changes", "Merge", "Close without merging", "Send reply"]) {
      expect(text(view)).toContain(button);
    }
    expect(html(view)).toContain(`<input type="hidden" name="head" value="${guide.head}">`);
    expect(html(view)).toContain(`<input type="hidden" name="returnTo" value="${REVIEW_PANEL}">`);
  });

  // Proves a file the reviewer may not review is counted, never named: not its path, not its diff thread, not the
  // pull request's title, which could name it; and nothing can be decided here.
  it("keeps back a file the reviewer may not review", async () => {
    const site = await seeded();

    const view = await site.page("mod", `${REVIEW_PANEL}${paris.number}/`);

    expect(text(view)).toContain("Pull request #44");
    expect(text(view)).toContain("Places/Paris.md");
    expect(text(view)).toContain("1 file you can't review");
    expect(text(view)).toContain("You can't review every file this submission changes, so you can't approve, merge or close it here.");
    expect(html(view)).not.toMatch(/plans|secret/i);
    expect(html(view)).not.toContain("<form");
  });

  // Proves the page still answers while GitHub is down: the conversation shows, the changes and forms don't.
  it("shows the conversation when GitHub can't be asked", async () => {
    const site = await seeded();
    site.github.down = true;

    const view = await site.page("mod", `${REVIEW_PANEL}${guide.number}/`);

    expect(text(view)).toContain("GitHub isn't answering right now, so the changes can't be shown.");
    expect(text(view)).toContain("Plant, or set up?");
    expect(html(view)).not.toContain("<form");
  });

  // Proves paging: 25 a page, newest activity first, an Older link while there are more, and a page's D1 cost that
  // doesn't grow with its rows.
  it("pages through open submissions within a free Worker's D1 allowance", async () => {
    const site = await seeded();
    for (let number = 100; number < 126; number++) {
      const at = `2025-10-${String(number - 99).padStart(2, "0")}T00:00:00Z`;
      await site.deliver("pull_request", { action: "opened", number, pull_request: pullJson(number, sha(number), `patch-${number}`, { title: `Patch ${number}`, user: "octocat", at }) });
    }
    // The poll reads 30 requests' worth at a time, fewer than these pull requests' files: they are taken as read.
    await site.rows("UPDATE submissions_pulls SET in_vault = 1 WHERE number >= 100");
    site.d1.count = 0;

    const first = await site.page("mod", REVIEW_PANEL);
    const count = site.d1.count;
    const second = await site.page("mod", `${REVIEW_PANEL}?page=2`);

    expect(html(first).match(/class="sv-account-row"/g)).toHaveLength(25);
    expect(text(first)).toMatch(/Pull request #44 .* Guide .* Pull request #125 .* Older$/);
    expect(text(second)).toMatch(/Pull request #102 .* Pull request #101 .* Pull request #100 .* Newer$/);
    // 14 today: one query lists the page and one names its submitters, whatever the page holds.
    expect(count).toBeLessThanOrEqual(14);
  });

  // Proves the detail view's D1 cost stays fixed: the mirror, the conversation and a check per page changed.
  it("renders a submission within a free Worker's D1 allowance", async () => {
    const site = await seeded();
    await site.page("mod", `${REVIEW_PANEL}${guide.number}/`);
    await site.settle();
    site.d1.count = 0;

    await site.page("mod", `${REVIEW_PANEL}${guide.number}/`);
    await site.settle();

    // 20 today, one of them the check on the one page it changes. Checks stop at MAX_CHECKED_PAGES (20) pages, so a
    // submission changing more stays within the 50 a free Worker allows.
    expect(site.d1.count).toBeLessThanOrEqual(20);
  });
});

describe("review actions", () => {
  // Proves a general comment and a line comment go through the App under the attribution header, are audited, and
  // show as the account that wrote them.
  it("comments on the conversation and on a line, attributed and audited", async () => {
    const site = await seeded();
    const replay = replayGitHub([
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/issues/43/comments`, body: { body: `${MOD_HEADER}\n\nLooks right, @⁠octocat.` } },
        response: { status: 201, json: comment(9_000_001, `${MOD_HEADER}\n\nLooks right, @⁠octocat.`) },
      },
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/pulls/43/comments`, body: { body: `${MOD_HEADER}\n\nPlant is right.`, commit_id: guide.head, path: "content/guide.md", line: 7, side: "RIGHT" } },
        response: { status: 201, json: comment(9_000_002, `${MOD_HEADER}\n\nPlant is right.`, { path: "content/guide.md", line: 7, html_url: `https://github.com/${REPO}/pull/43#discussion_r9000002` }) },
      },
    ], INSTALLATION_TOKEN);

    const general = await post(site, "mod", "comment", { pull: "43", body: "Looks right, @octocat." });
    const line = await post(site, "mod", "line", { pull: "43", head: guide.head, file: "content/guide.md", at: "RIGHT:7", index: "0", body: "Plant is right." });

    expect(replay.pending).toEqual([]);
    expect(general.headers.get("location")).toBe(`${REVIEW_PANEL}43/?status=sent#comment-9000001`);
    expect(line.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=commented&file=0#svartz-file-0`);
    expect(await audited(site)).toEqual([
      { actor_handle: "mod", action: "submissions:submission:comment", target: "submission:43", detail: { repo: REPO, vault: "wiki" } },
      { actor_handle: "mod", action: "submissions:submission:comment", target: "submission:43", detail: { repo: REPO, vault: "wiki", head: guide.head, path: "content/guide.md", line: 7, side: "RIGHT" } },
    ]);
    vi.unstubAllGlobals();
    const shown = text(await site.page("mod", `${REVIEW_PANEL}43/`));
    expect(shown).toContain("Mo Derator reviewer");
    expect(shown).toContain("Looks right, @⁠octocat.");
    expect(shown).not.toContain("[!NOTE]");
  });

  // Proves approving: a real approval on someone else's pull request, and on one the site opened, which GitHub won't
  // let the site approve, the verdict posted as a comment under the header instead.
  it("approves, or posts the verdict as a comment on the site's own pull request", async () => {
    const site = await seeded();
    const review = (number: number, head: string, id: number, event: string, body: string) => ({
      request: { method: "POST", url: `${API}/pulls/${number}/reviews`, body: { commit_id: head, event, body } },
      response: {
        status: 200,
        json: { id, state: event === "APPROVE" ? "APPROVED" : "COMMENTED", body, user: { login: "wikiplace-editor[bot]" }, html_url: `https://github.com/${REPO}/pull/${number}#pullrequestreview-${id}`, submitted_at: "2026-11-19T12:00:00Z", commit_id: head },
      },
    });
    const replay = replayGitHub([
      ...inspection(paris.number, [PARIS_FILES[0]], paris.head),
      review(44, paris.head, 1, "APPROVE", ADA_HEADER),
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/pulls/43/reviews`, body: { commit_id: guide.head, event: "APPROVE", body: MOD_HEADER } },
        response: { status: 422, json: { message: "Unprocessable Entity", errors: ["Can not approve your own pull request"] } },
      },
      review(43, guide.head, 2, "COMMENT", `${MOD_HEADER}\n\nApproved.`),
    ], INSTALLATION_TOKEN);

    const approved = await post(site, "ada", "verdict", { pull: "44", head: paris.head, event: "approve", body: "" });
    const own = await post(site, "mod", "verdict", { pull: "43", head: guide.head, event: "approve", body: "" });

    expect(replay.pending).toEqual([]);
    expect(approved.headers.get("location")).toBe(`${REVIEW_PANEL}44/?review=approved#svartz-review`);
    expect(own.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=approved-as-comment#svartz-review`);
    expect((await audited(site)).map(({ actor_handle, action, target }) => [actor_handle, action, target])).toEqual([
      ["ada", "submissions:submission:approve", "submission:44"],
      ["mod", "submissions:submission:approve", "submission:43"],
    ]);
  });

  // Proves a merge names who merged it and uses the method the repository allows, at the head the reviewer saw.
  it("merges at the head the reviewer saw, attributed and audited", async () => {
    const site = await seeded();
    const mod = await site.accountId("mod");
    const replay = replayGitHub([
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      { request: { method: "GET", url: API }, response: { status: 200, json: { full_name: REPO, allow_merge_commit: false, allow_squash_merge: true } } },
      {
        request: {
          method: "PUT",
          url: `${API}/pulls/43/merge`,
          body: { sha: guide.head, merge_method: "squash", commit_title: "Edit content/guide.md (#43)", commit_message: `Merged on wiki.test by Mo Derator (mod).\n\nSvartz-Account: ${mod}` },
        },
        response: { status: 200, json: { sha: sha(4343), merged: true, message: "Pull Request successfully merged" } },
      },
    ], INSTALLATION_TOKEN);

    const merged = await post(site, "mod", "merge", { pull: "43", head: guide.head });

    expect(replay.pending).toEqual([]);
    expect(merged.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=merged#svartz-review`);
    expect(await audited(site)).toEqual([
      { actor_handle: "mod", action: "submissions:submission:merge", target: "submission:43", detail: { repo: REPO, vault: "wiki", head: guide.head, method: "squash" } },
    ]);
  });

  // Proves no decision goes through a head that moved since the reviewer looked: nothing is written or audited.
  it.each([
    ["merge", { pull: "43", head: guide.head }],
    ["verdict", { pull: "43", head: guide.head, event: "request-changes", body: "Cite it." }],
    ["line", { pull: "43", head: guide.head, file: "content/guide.md", at: "RIGHT:7", index: "0", body: "Hm." }],
  ])("refuses a %s through a head that moved", async (route, fields) => {
    const site = await seeded();
    const replay = replayGitHub(inspection(guide.number, GUIDE_FILES, sha(4545)), INSTALLATION_TOKEN);

    const answer = await post(site, "mod", route, fields);

    expect(replay.pending).toEqual([]);
    expect(answer.headers.get("location")).toMatch(/[?&]review=head-moved/);
    expect(await audited(site)).toEqual([]);
  });

  // Proves the boundaries: no action from another site, from someone without the permission, on a pull request this
  // vault's mirror doesn't hold, or on one with a file the reviewer may not review; none reaches GitHub or the log.
  it.each([
    ["from another origin", "mod", { pull: "43", body: "Hi" }, "https://evil.example", [], 403],
    ["without the permission", "reader", { pull: "43", body: "Hi" }, ORIGIN, [], 403],
    ["on a pull request the vault doesn't hold", "mod", { pull: "7", body: "Hi" }, ORIGIN, [], 404],
    ["with a file the reviewer may not review", "mod", { pull: "44", body: "Hi" }, ORIGIN, inspection(paris.number, PARIS_FILES, paris.head), 403],
  ] as const)("refuses a comment %s, writing nothing", async (_case, viewer, fields, origin, exchanges, status) => {
    const site = await seeded();
    const replay = replayGitHub(exchanges, INSTALLATION_TOKEN);

    const answer = await post(site, viewer, "comment", fields, origin);

    expect(answer.status).toBe(status);
    expect(replay.pending).toEqual([]);
    expect(replay.requests.filter(({ method }) => method !== "GET")).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });
});

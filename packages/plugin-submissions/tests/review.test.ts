/**
 * The Submissions review panel and its routes, through Svartz's real server beside the real `auth` plugin on a real
 * D1 from Miniflare (`edits-harness.ts`). The mirror fills through signed webhook deliveries and the reconcile poll;
 * what each action sends GitHub is replayed exchange by exchange.
 */
import type { PageResult } from "@svartz/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditsSite, ORIGIN, pullJson, REPO, REVIEW_PANEL, REVIEWED_GUIDE, REVIEWS, seedReviews, sha, type EditsSite, type Viewer } from "./edits-harness";
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
/** GitHub's answer to the commit reader reading `path` at `head`: `markdown`. */
const headRead = (path: string, head: string, markdown: string): Exchange => ({
  request: { method: "GET", url: `${API}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${head}` },
  response: { status: 200, raw: markdown },
});
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

  // Proves the detail keeps to the pause the reconcile poll shares: a pause already held asks GitHub nothing, and an
  // answer that leaves the hourly allowance at the reserve starts one before the next read. The conversation stays.
  it("reads GitHub only outside the shared pause", async () => {
    const site = await seeded();
    const later = Date.now() + 3_600_000;
    await site.rows("UPDATE submissions_sync SET paused_until = ?", later);
    const asked = site.github.requests.length;

    const paused = text(await site.page("mod", `${REVIEW_PANEL}${guide.number}/`));

    expect(site.github.requests.slice(asked).filter((request) => request.includes("/pulls/43"))).toEqual([]);
    expect(paused).toContain("GitHub isn't answering right now, so the changes can't be shown.");
    expect(paused).toContain("Plant, or set up?");

    await site.rows("UPDATE submissions_sync SET paused_until = 0");
    await site.settle();
    const replay = replayGitHub([{
      request: { method: "GET", url: `${API}/pulls/43` },
      response: {
        status: 200,
        json: pullJson(43, guide.head, guide.branch, { title: "Edit content/guide.md", user: "octocat", at: "2026-11-19T10:00:00Z" }),
        headers: { "x-ratelimit-remaining": "100", "x-ratelimit-reset": String(Math.floor(later / 1000)) },
      },
    }], INSTALLATION_TOKEN);

    const reserved = text(await site.page("mod", `${REVIEW_PANEL}${guide.number}/`));

    expect(replay.requests.map(({ url }) => url)).toEqual([`${API}/pulls/43`]);
    expect(reserved).toContain("GitHub isn't answering right now, so the changes can't be shown.");
    expect(await site.rows("SELECT paused_until FROM submissions_sync")).toEqual([{ paused_until: Math.floor(later / 1000) * 1000 }]);
  });

  // Proves a page a reviewer may not review is never named: not in the list, not as the submission's title or link,
  // even when it is the page the site saved.
  it("names a saved page only to whoever may review it", async () => {
    const site = await seeded();
    await site.request("/wiki/_svartz/auth/people/grant/", {
      method: "POST", headers: { cookie: site.sessions.ada, origin: ORIGIN },
      body: new URLSearchParams({ "actor-type": "account", actor: "mod", permission: "submissions:reviews:write", scope: "vault:wiki", path: "guide", value: "deny" }),
    });

    const listed = text(await site.page("mod", REVIEW_PANEL));
    const view = await site.page("mod", `${REVIEW_PANEL}${guide.number}/`);

    expect(listed).toContain("Pull request #43 Edit · #43");
    expect(listed).not.toContain("Guide");
    expect(text(view)).toContain("Pull request #43 Edit · Pull request #43 on GitHub");
    expect(text(view)).not.toMatch(/Guide|Open the page/);
  });

  // Proves both sides of a move are judged together: a diff thread on the allowed side of a file moved from a page the
  // reviewer may not review stays out, as the file itself does.
  it("keeps back a diff thread on either side of a move it can't show", async () => {
    const site = await seeded();
    const pull = site.github.pulls.get(paris.number)!;
    site.github.pulls.set(paris.number, {
      ...pull,
      files: [{ filename: "content/Places/Paris.md", previous_filename: "content/private/plans.md", status: "renamed", patch: "@@ -1 +1 @@\n-The secret plans.\n+# Paris" }],
    });
    await site.deliver("pull_request_review_comment", {
      action: "created",
      comment: { id: 7_000_003, path: "content/Places/Paris.md", line: 1, body: "Why move the plans here?", user: { login: "octocat" }, html_url: `https://github.com/${REPO}/pull/44#discussion_r7000003`, created_at: "2026-11-19T11:00:00Z", updated_at: "2026-11-19T11:00:00Z" },
      pull_request: { ...pull.json, updated_at: "2026-11-19T11:00:00Z" },
    });

    const view = text(await site.page("mod", `${REVIEW_PANEL}${paris.number}/`));

    expect(view).toContain("1 file you can't review");
    expect(view).not.toMatch(/plans|Paris/i);
  });

  // Proves review answers are looked up as the panel's own: a code every object inherits, such as `constructor`,
  // shows nothing instead of breaking the page.
  it("ignores status codes it doesn't know", async () => {
    const site = await seeded();

    const view = text(await site.page("mod", `${REVIEW_PANEL}${guide.number}/?review=constructor&status=toString`));

    expect(view).toContain("Edit content/guide.md");
    expect(view).toContain("Plant, or set up?");
  });

  // Proves a closed submission keeps its diff, reads nothing at its head, which is no open pull request's any more,
  // and still shows a line comment's answer once that comment's form is gone.
  it("shows a closed submission's diff and a line comment's answer, reading nothing at its head", async () => {
    const site = await seeded();
    const pull = site.github.pulls.get(guide.number)!;
    site.github.pulls.set(guide.number, { ...pull, json: { ...pull.json, state: "closed", head: { ...pull.json.head, sha: sha(4747) } } });
    const asked = site.github.requests.length;

    const view = text(await site.page("mod", `${REVIEW_PANEL}${guide.number}/?review=closed&file=0`));

    expect(view).toContain("Changes This submission is closed. guide.md");
    expect(view).toContain("Plant the wiki.");
    expect(site.github.requests.slice(asked).filter((request) => request.includes("/contents/"))).toEqual([]);
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
    // 15 today: one query lists the page and one names its submitters, whatever the page holds, and one checks each
    // page a saved submission edits before naming it (here the guide), at most MAX_CHECKED_PAGES (20).
    expect(count).toBeLessThanOrEqual(15);
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

  // Proves a verdict the site posts is the account's: shown under its name, and counted as its decision even where
  // GitHub holds it as a comment, one decision per account, not one for the App that posted them all.
  it("records each reviewer's verdict on the site's own pull request as theirs", async () => {
    const site = await seeded();
    const fallback = (id: number, header: string, event: string, body: string, said: string) => [
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/pulls/43/reviews`, body: { commit_id: guide.head, event, body } },
        response: { status: 422, json: { message: "Unprocessable Entity", errors: ["Can not request changes on your own pull request"] } },
      },
      {
        request: { method: "POST", url: `${API}/pulls/43/reviews`, body: { commit_id: guide.head, event: "COMMENT", body: `${header}\n\n${said}` } },
        response: {
          status: 200,
          json: { id, state: "COMMENTED", body: `${header}\n\n${said}`, user: { login: "wikiplace-editor[bot]" }, html_url: `https://github.com/${REPO}/pull/43#pullrequestreview-${id}`, submitted_at: "2026-11-19T12:00:00Z", commit_id: guide.head },
        },
      },
    ];
    const replay = replayGitHub([
      ...fallback(11, ADA_HEADER, "APPROVE", ADA_HEADER, "Approved."),
      ...fallback(12, MOD_HEADER, "REQUEST_CHANGES", `${MOD_HEADER}\n\nCite it.`, "Changes requested.\n\nCite it."),
    ], INSTALLATION_TOKEN);

    await post(site, "ada", "verdict", { pull: "43", head: guide.head, event: "approve", body: "" });
    await post(site, "mod", "verdict", { pull: "43", head: guide.head, event: "request-changes", body: "Cite it." });
    vi.unstubAllGlobals();

    expect(replay.pending).toEqual([]);
    expect(text(await site.page("mod", REVIEW_PANEL))).toMatch(/Guide Edit · #43 .* Changes requested$/);
    const shown = text(await site.page("mod", `${REVIEW_PANEL}43/`));
    expect(shown).toContain("Ada Lovelace admin reviewed");
    expect(shown).toContain("Mo Derator reviewer reviewed");
    expect(shown).toContain("Changes requested. Cite it.");
    expect(shown).not.toContain("[!NOTE]");
  });

  // Proves a post GitHub took is answered as posted when the site can't record it, so nobody posts it twice.
  it("answers a post GitHub took as sent, even when the site can't record it", async () => {
    const site = await seeded();
    for (const table of ["submissions_replies", "submissions_posted_reviews"]) {
      await site.rows(`CREATE TRIGGER refuse_${table} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'database full'); END`);
    }
    const replay = replayGitHub([
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/issues/43/comments`, body: { body: `${MOD_HEADER}\n\nLooks right.` } },
        response: { status: 201, json: comment(9_000_001, `${MOD_HEADER}\n\nLooks right.`) },
      },
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/pulls/43/comments`, body: { body: `${MOD_HEADER}\n\nPlant is right.`, commit_id: guide.head, path: "content/guide.md", line: 7, side: "RIGHT" } },
        response: { status: 201, json: comment(9_000_002, `${MOD_HEADER}\n\nPlant is right.`, { path: "content/guide.md", line: 7 }) },
      },
      ...inspection(guide.number, GUIDE_FILES, guide.head),
      {
        request: { method: "POST", url: `${API}/pulls/43/reviews`, body: { commit_id: guide.head, event: "APPROVE", body: MOD_HEADER } },
        response: { status: 200, json: { id: 13, state: "APPROVED", body: MOD_HEADER, user: { login: "wikiplace-editor[bot]" }, html_url: `https://github.com/${REPO}/pull/43#pullrequestreview-13`, submitted_at: "2026-11-19T12:00:00Z", commit_id: guide.head } },
      },
    ], INSTALLATION_TOKEN);

    const general = await post(site, "mod", "comment", { pull: "43", body: "Looks right." });
    const line = await post(site, "mod", "line", { pull: "43", head: guide.head, file: "content/guide.md", at: "RIGHT:7", index: "0", body: "Plant is right." });
    const verdict = await post(site, "mod", "verdict", { pull: "43", head: guide.head, event: "approve", body: "" });

    expect(replay.pending).toEqual([]);
    expect(general.headers.get("location")).toBe(`${REVIEW_PANEL}43/?status=sent#comment-9000001`);
    expect(line.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=commented&file=0#svartz-file-0`);
    expect(verdict.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=approved#svartz-review`);
  });

  // Proves a page's content is reviewed by the routes it claims, in every format the build publishes as a note: a
  // reviewer who may not review Setup can't see, nor merge, a new page whose frontmatter takes Setup's address, though
  // its own path is one they may review.
  it.each(["md", "mdx", "svx"])("refuses a .%s page that claims a route the reviewer may not review", async (format) => {
    const site = await seeded();
    await site.request("/wiki/_svartz/auth/people/grant/", {
      method: "POST", headers: { cookie: site.sessions.ada, origin: ORIGIN },
      body: new URLSearchParams({ "actor-type": "account", actor: "mod", permission: "submissions:reviews:write", scope: "vault:wiki", path: "setup", value: "deny" }),
    });
    const claiming = [{ filename: `content/new.${format}`, status: "added", patch: "@@ -0,0 +1,3 @@\n+---\n+slug: setup\n+---" }];
    const pull = site.github.pulls.get(guide.number)!;
    site.github.pulls.set(guide.number, { ...pull, files: claiming });
    site.github.files.set(`content/new.${format}@${guide.head}`, "---\nslug: setup\n---\n");

    const view = text(await site.page("mod", `${REVIEW_PANEL}${guide.number}/`));
    const replay = replayGitHub(inspection(guide.number, claiming, guide.head), INSTALLATION_TOKEN);
    const merge = await post(site, "mod", "merge", { pull: "43", head: guide.head });

    expect(view).toContain("1 file you can't review");
    expect(view).not.toContain(`new.${format}`);
    expect(merge.status).toBe(403);
    expect(replay.pending).toEqual([]);
    expect(replay.requests.filter(({ method }) => method !== "GET")).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  // Proves an action while reads are paused acts on nothing it couldn't check: a page whose head can't be read
  // answers as GitHub not answering, and nothing is written.
  it("acts on no page it couldn't read while reads are paused", async () => {
    const site = await seeded();
    await site.rows("UPDATE submissions_sync SET paused_until = ?", Date.now() + 3_600_000);
    const replay = replayGitHub(inspection(guide.number, GUIDE_FILES, sha(4646)), INSTALLATION_TOKEN);

    const merge = await post(site, "mod", "merge", { pull: "43", head: sha(4646) });

    expect(replay.pending).toEqual([]);
    expect(merge.headers.get("location")).toBe(`${REVIEW_PANEL}43/?review=github#svartz-review`);
    expect(await audited(site)).toEqual([]);
  });

  // Proves one request asks each page once and no more than MAX_CHECKED_PAGES: a reply in a thread on a file past
  // that cap is refused, though the reviewer may review it.
  it("asks no more pages than the cap, a reply's thread included", async () => {
    const site = await seeded();
    const twenty = Array.from({ length: 20 }, (_, n) => ({ filename: `content/files/${n}.txt`, status: "added", patch: "@@ -0,0 +1 @@\n+text" }));
    const replay = replayGitHub(inspection(guide.number, twenty, guide.head), INSTALLATION_TOKEN);

    const reply = await post(site, "mod", "comment", { pull: "43", thread: "7000001", body: "Plant." });

    expect(reply.status).toBe(403);
    expect(replay.pending).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  // Proves an event the form doesn't offer, such as an inherited name, is refused before anything else happens.
  it("refuses a verdict it doesn't know, asking GitHub nothing", async () => {
    const site = await seeded();
    const replay = replayGitHub([], INSTALLATION_TOKEN);

    const answer = await post(site, "mod", "verdict", { pull: "43", head: guide.head, event: "constructor", body: "" });

    expect(answer.status).toBe(400);
    expect(replay.requests).toEqual([]);
    expect(await audited(site)).toEqual([]);
  });

  // Proves Close, offered beside the review forms, keeps to their rules: the account's limit for reviews first, then
  // the permission on every file the submission changes, before GitHub is asked to close it or the log records it.
  it("closes only within the reviewer's limit, and only what they may review in full", async () => {
    const close = (site: EditsSite) => site.request("/wiki/_svartz/submissions/close/", {
      method: "POST", headers: { cookie: site.sessions.mod, origin: ORIGIN }, body: new URLSearchParams({ number: "43", returnTo: REVIEW_PANEL }),
    });
    const limited = await createEditsSite({ SVARTZ_SUBMISSIONS_RATE_LIMIT: { limit: async ({ key }: { key: string }) => ({ success: !key.startsWith("review:") }) } });
    sites.push(limited);
    await seedReviews(limited);
    const site = await seeded();
    const replay = replayGitHub([
      ...inspection(guide.number, [...GUIDE_FILES, { filename: "content/private/plans.md", status: "added", patch: "@@ -0,0 +1 @@\n+The secret plans." }], guide.head),
    ], INSTALLATION_TOKEN);

    const overLimit = await close(limited);
    const partly = await close(site);

    expect(overLimit.status).toBe(429);
    expect(partly.status).toBe(403);
    expect(replay.pending).toEqual([]);
    expect(replay.requests.filter(({ method }) => method !== "GET")).toEqual([]);
    expect([...await audited(limited), ...await audited(site)]).toEqual([]);
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
    const replay = replayGitHub([...inspection(guide.number, GUIDE_FILES, sha(4545)), headRead("content/guide.md", sha(4545), REVIEWED_GUIDE)], INSTALLATION_TOKEN);

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

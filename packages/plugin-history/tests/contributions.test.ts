/**
 * An account's contributions, on its contributions page and below its user page, over Svartz's real server router and
 * a mirror the submissions plugin's routes filled, with GitHub replayed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADA,
  backfill,
  createSite,
  DIRECT_COMMIT,
  disposeSites,
  firstToken,
  GITHUB_WEB,
  GRACE as GRACE_SIGN_IN,
  INSTALLATION_TOKEN,
  NOTE,
  replayGitHub,
  rows,
  siteMessage,
  text,
  type TestCommit,
} from "./harness";

afterEach(async () => {
  await disposeSites();
  vi.unstubAllGlobals();
});

const ORIGIN = "https://wiki.example";
const GUIDE_PATH = "content/guide.md";
const SETUP_PATH = "content/setup.md";
const SECRET_PATH = "content/secret.md";
const SECTION = "/wiki/_svartz/history/contributions/";
const ADA_GIT = { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" };
const sha = (n: number) => n.toString(16).padStart(40, "e");

type Site = Awaited<ReturnType<typeof createSite>>;

/** The titles a contributions page or section lists under Pages edited, in order. */
const pagesEdited = (html: string) =>
  [...(html.split('<ul class="sv-history-pages">')[1]?.split("</ul>")[0] ?? "").matchAll(/<a [^>]+>([^<]+)<\/a>/g)].map(([, title]) => title);

/** Read the mirror once, as the first page view does: the reconcile poll backfills with `commits`. */
async function backfilled(site: Site, path: string, commits: readonly TestCommit[], init?: RequestInit) {
  replayGitHub([firstToken, ...backfill(commits)], INSTALLATION_TOKEN);
  const page = await site.page(path, init);
  await site.settle();
  return page;
}

/** `count` saves `account` made from the site, a minute apart from 10:00, each changing the file `fileOf` names. */
async function saves(site: Site, account: string, count: number, first: number, fileOf: (index: number) => string = () => GUIDE_PATH) {
  const commits = Array.from({ length: count }, (_, index): TestCommit => ({
    sha: sha(first + index), message: siteMessage(`Edit ${index}`, account), at: index, author: ADA_GIT, files: [fileOf(index)],
  }));
  await site.recordCommits(account, commits.map(({ sha }) => sha));
  await site.push(commits);
  return commits;
}

describe("/-/contributions/<handle>/", () => {
  // Proves an account's contributions are exactly what the site's records credit it with: its direct commit and the
  // merge of the pull request it opened, never a commit that copies its git metadata or the commits inside the pull
  // request; and the pages they changed.
  it("lists the account's saves and merged submissions, and nothing git alone claims", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const grace = await site.signUp(GRACE_SIGN_IN);
    await site.recordCommits(ada.id, [DIRECT_COMMIT]);
    await site.graceOpensPullRequest(grace);
    const savedByAda: TestCommit = { sha: DIRECT_COMMIT, message: siteMessage(NOTE, ada.id), at: 30, author: ADA_GIT, files: [GUIDE_PATH] };
    const forged: TestCommit = { sha: "c".repeat(40), message: siteMessage("Removed the forum.", ada.id, SETUP_PATH), at: 45, author: ADA_GIT, files: [SETUP_PATH] };
    const inside: TestCommit = {
      sha: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f", message: `Edit ${GUIDE_PATH}`, at: 35,
      author: { name: "Grace Hopper", email: "2+grace@users.noreply.github.com", login: "grace" }, committer: GITHUB_WEB, files: [GUIDE_PATH],
    };
    const merge: TestCommit = {
      sha: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0", message: "Merge pull request #42\n\nEdit content/guide.md", at: 40,
      author: { name: "Mia", email: "mia@example.com", login: "mia" }, committer: GITHUB_WEB, files: [GUIDE_PATH, SETUP_PATH],
    };
    await site.merged(merge.sha);
    const commits = [savedByAda, inside, merge, forged];
    await site.push(commits);

    const adas = await backfilled(site, "/wiki/-/contributions/ada/", commits);
    const graces = await site.page("/wiki/-/contributions/grace/");

    expect(adas?.title).toBe("Contributions by Ada Lovelace");
    expect(rows(adas)).toEqual([`10:30 UTC Guide (changes, history) ${NOTE}`]);
    expect(pagesEdited(adas!.html)).toEqual(["Guide"]);
    expect(text(adas!.html)).not.toMatch(/Setup|forum/);
    expect(rows(graces)).toEqual(["10:40 UTC Guide (changes, history) Setup (changes, history) Merge pull request #42"]);
    expect(pagesEdited(graces!.html)).toEqual(["Guide", "Setup"]);
    expect(await site.page("/wiki/-/contributions/nobody/")).toBeUndefined();
  });

  // Proves nothing of a page the site hides shows: a commit to it alone stays out, and a commit that also changed it
  // shows the published page without its summary.
  it("leaves out what the site hides", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const hiddenOnly: TestCommit = { sha: sha(1), message: siteMessage("Plan the secret launch", ada.id, SECRET_PATH), at: 50, author: ADA_GIT, files: [SECRET_PATH] };
    const both: TestCommit = { sha: sha(2), message: siteMessage("Tidy the guide and the secret plans", ada.id), at: 40, author: ADA_GIT, files: [GUIDE_PATH, SECRET_PATH] };
    await site.recordCommits(ada.id, [hiddenOnly.sha, both.sha]);
    await site.push([both, hiddenOnly]);

    const page = await backfilled(site, "/wiki/-/contributions/ada/", [hiddenOnly, both]);

    expect(rows(page)).toEqual(["10:40 UTC Guide (changes, history)"]);
    expect(page!.html.toLowerCase()).not.toMatch(/secret|launch|plans/);
  });

  // Proves an account's edits page back past the first 50, and every page they changed is listed, latest first.
  it("pages through edits, older ones behind a link", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const commits = await saves(site, ada.id, 51, 100, (index) => (index === 50 ? SETUP_PATH : GUIDE_PATH));

    const first = await backfilled(site, "/wiki/-/contributions/ada/", commits);
    const older = first!.html.match(/href="([^"]+)">Older edits</)![1]!.replaceAll("&#38;", "&");
    const second = await site.page(older);

    expect(rows(first)).toHaveLength(50);
    expect(rows(first)[0]).toBe("10:50 UTC Setup (changes, history) Edit 50");
    expect(older).toBe(`/wiki/-/contributions/ada/?before=${sha(101)}`);
    expect(rows(second)).toEqual(["10:00 UTC Guide (changes, history) Edit 0"]);
    expect(second!.html).not.toContain("Older edits");
    expect(pagesEdited(first!.html)).toEqual(["Setup", "Guide"]);
  });

  // Proves a full page stays well within one Worker invocation's D1 allowance (50 queries on Workers Free, a batch
  // counting as one): the edits and the pages they changed cost a batch and a query, not a query per edit.
  it("renders a full page within a free Worker's D1 allowance", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const commits = await saves(site, ada.id, 60, 200, (index) => (index % 2 ? GUIDE_PATH : SETUP_PATH));
    const own = { headers: { cookie: ada.cookie } };
    await backfilled(site, "/wiki/-/contributions/ada/", commits, own);

    site.d1.count = 0;
    const page = await site.page("/wiki/-/contributions/ada/", own);
    await site.settle();

    expect(rows(page)).toHaveLength(50);
    // 8 today. A query per edit would add 50.
    expect(site.d1.count).toBeLessThanOrEqual(12);
  });

  // Proves an old handle's contributions move to the current one, as its user page does.
  it("follows a changed handle to the current one", async () => {
    const site = await createSite();
    const grace = await site.signUp(GRACE_SIGN_IN);
    const changed = await site.request("/wiki/_svartz/auth/account/profile/?returnTo=/wiki/-/account/", {
      method: "POST",
      headers: { cookie: grace.cookie, origin: ORIGIN },
      body: new URLSearchParams({ name: "Grace Hopper", handle: "hopper" }),
    });
    expect(changed.status).toBe(303);

    expect(await site.redirectOf("/wiki/-/contributions/grace/")).toBe("/wiki/-/contributions/hopper/");
  });
});

describe("reputation on contributions", () => {
  // Proves everyone sees an account's score, and only the account sees how far its next threshold is.
  it("shows the score to everyone and the next threshold to the account alone", async () => {
    const site = await createSite();
    const grace = await site.signUp(GRACE_SIGN_IN);
    await site.earnPage(grace.id, "test:page:1");
    const path = "/wiki/-/contributions/grace/";
    const own = { headers: { cookie: grace.cookie } };

    const before = await backfilled(site, path, [], own);
    await site.threshold("editors", 20);
    const guest = await site.page(path);
    const self = await site.page(path, own);

    expect(text(before!.html)).toContain("Reputation: 5 points Edits No edits yet.");
    expect(text(guest!.html)).toContain("Reputation: 5 points Edits No edits yet.");
    expect(text(self!.html)).toContain("Reputation: 5 points 15 points to go: at 20 points, you get the editors role. Edits");
  });
});

describe("who made a change, linked", () => {
  // Proves an account's name links to its user page where it has one, and to its contributions where it doesn't.
  it("links an author to their user page, or else their contributions", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    const grace = await site.signUp(GRACE_SIGN_IN);
    site.addUserPage("ada", "/wiki/users/ada/");
    const adaEdit: TestCommit = { sha: sha(1), message: siteMessage("Expand the guide", ada.id), at: 10, author: ADA_GIT, files: [GUIDE_PATH] };
    const graceEdit: TestCommit = { sha: sha(2), message: siteMessage("Tidy the guide", grace.id), at: 20, author: ADA_GIT, files: [GUIDE_PATH] };
    await site.recordCommits(ada.id, [adaEdit.sha]);
    await site.recordCommits(grace.id, [graceEdit.sha]);
    await site.push([adaEdit, graceEdit]);

    const changes = await backfilled(site, "/wiki/-/changes/", [graceEdit, adaEdit]);
    const adas = await site.page("/wiki/-/contributions/ada/");

    expect(changes!.html).toContain('<a class="sv-history-name" href="/wiki/users/ada/">Ada Lovelace</a>');
    expect(changes!.html).toContain('<a class="sv-history-name" href="/wiki/-/contributions/grace/">Grace Hopper</a>');
    expect(adas!.html).toContain('<h1>Contributions by <a href="/wiki/users/ada/">Ada Lovelace</a>');
  });
});

describe("the section below a user page", () => {
  // Proves a user page gets its account's reputation, latest edits, the pages they changed and a link to the rest,
  // and no other page gets a section.
  it("answers the account's latest contributions for its user page, and nothing for other pages", async () => {
    const site = await createSite();
    const ada = await site.signUp(ADA);
    site.addUserPage("ada", "/wiki/users/ada/");
    await site.earnPage(ada.id, "test:page:1");
    const commits = await saves(site, ada.id, 7, 300, (index) => (index === 0 ? SETUP_PATH : GUIDE_PATH));
    replayGitHub([firstToken, ...backfill(commits)], INSTALLATION_TOKEN);

    const response = await site.request(`${SECTION}?page=${encodeURIComponent("/wiki/users/ada/")}`);
    await site.settle();
    const html = await response.text();
    const other = await site.request(`${SECTION}?page=${encodeURIComponent("/wiki/guide/")}`);

    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(text(html)).toMatch(/^Contributions Reputation: 5 points Latest edits /);
    expect(rows({ title: "", html })).toEqual([6, 5, 4, 3, 2].map((index) => `19 Nov 2026, 10:0${index} UTC Guide (changes, history) Edit ${index}`));
    expect(pagesEdited(html)).toEqual(["Guide", "Setup"]);
    expect(html).toContain('href="/wiki/-/contributions/ada/">All contributions</a>');
    expect(other.status).toBe(404);
  });
});

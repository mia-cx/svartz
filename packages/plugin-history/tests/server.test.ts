/**
 * The history pages over Svartz's real server router, reading a mirror the submissions plugin's webhook route filled,
 * with GitHub replayed through the submissions plugin's fake exchanges.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADA,
  API,
  backfill,
  botLookup,
  contentExchange,
  createSite,
  disposeSites,
  firstToken,
  GITHUB_WEB,
  historyExchange,
  INSTALLATION_TOKEN,
  replayGitHub,
  rows,
  text,
  type Exchange,
  type TestCommit,
} from "./harness";

afterEach(async () => {
  await disposeSites();
  vi.unstubAllGlobals();
});

const HISTORY = "/wiki/-/history/guide/";
const GUIDE_PATH = "content/guide.md";
const SECRET_PATH = "content/secret.md";
const GRACE = { name: "Grace Hopper", email: "grace@example.com", login: "grace" };

/** The guide's commits, oldest first: Grace adds it beside a hidden note, Ada saves from the site, someone forges Ada. */
function guideCommits(adaId: string): { added: TestCommit; saved: TestCommit; forged: TestCommit } {
  const ada = { name: "Ada Lovelace", email: "ada@users.noreply.wiki.example" };
  return {
    added: { sha: "a".repeat(40), message: "Add guide and secret plans", at: 0, author: GRACE, committer: GITHUB_WEB, files: [GUIDE_PATH, SECRET_PATH] },
    saved: { sha: "b".repeat(40), message: `Edit ${GUIDE_PATH}\n\nAdded the time it takes.\n\nSvartz-Account: ${adaId}`, at: 30, author: ada, files: [GUIDE_PATH] },
    // Anyone can write Ada's address and trailer into a commit; only the App's bot committing it makes it Ada's.
    forged: { sha: "c".repeat(40), message: `Fix typo\n\nSvartz-Account: ${adaId}`, at: 45, author: ada, committer: GITHUB_WEB, files: [GUIDE_PATH] },
  };
}

describe("/-/history/<page>", () => {
  // Proves a page's changes list newest first with authors resolved under the trust rule, from GitHub before the
  // mirror's backfill, from the mirror after it, and from GitHub again for what is older than the mirror holds.
  it("lists a page's changes, from GitHub before the backfill and from the mirror after it", async () => {
    const site = await createSite();
    const { added, saved, forged } = guideCommits(await site.signUp(ADA));
    await site.push([added, saved, forged]);
    const older: TestCommit = { sha: "d".repeat(40), message: "Start the guide", at: -60, author: GRACE, committer: GITHUB_WEB, files: [GUIDE_PATH] };

    const github = replayGitHub([firstToken, historyExchange(GUIDE_PATH, [forged, saved, added]), ...botLookup, ...backfill([forged, saved, added])], INSTALLATION_TOKEN);
    const expected = [
      // Ada's address and trailer, but GitHub's web committer: shown as its git author, never as Ada's account.
      "19 Nov 2026, 10:45 UTC Ada Lovelace Fix typo",
      // Committed by the App's bot: Ada's account, with the note she wrote as its summary.
      "19 Nov 2026, 10:30 UTC Ada Lovelace @ada Added the time it takes.",
      // It also changed a note the site hides, so its summary stays out.
      "19 Nov 2026, 10:00 UTC Grace Hopper grace on GitHub",
    ];
    const before = await site.page(HISTORY);
    expect(before?.title).toBe("History of Guide");
    expect(rows(before)).toEqual(expected);
    await site.settle();
    expect(github.pending).toEqual([]);

    // Backfilled: the mirror answers without asking GitHub.
    const mirrored = replayGitHub([], INSTALLATION_TOKEN);
    const after = await site.page(HISTORY);
    expect(rows(after)).toEqual(expected);
    expect(after?.html).toContain(`href="${HISTORY}?page=1"`);
    await site.settle();
    expect(mirrored.requests).toEqual([]);

    // Older than the mirror holds: GitHub's list, without what the mirror already showed.
    replayGitHub([historyExchange(GUIDE_PATH, [forged, saved, added, older])], INSTALLATION_TOKEN);
    const back = await site.page(`${HISTORY}?page=1`);
    expect(rows(back)).toEqual(["19 Nov 2026, 09:00 UTC Grace Hopper grace on GitHub"]);
    expect(back?.html).toContain(`href="${HISTORY}">Newer changes`);
    expect(back?.html).not.toContain("Older changes");
    for (const page of [before, after, back]) expect(page?.html.toLowerCase()).not.toContain("secret");
  });

  // Proves a reader can't make the site spend the requests it keeps for saves: once GitHub says the allowance is at
  // the reserve, history asks nothing more and says GitHub isn't answering.
  it("stops asking GitHub at the reserve the plugin keeps for saves", async () => {
    const site = await createSite();
    const commit: TestCommit = { sha: "e".repeat(40), message: "Start the guide", at: 0, author: GRACE, committer: GITHUB_WEB, files: [GUIDE_PATH] };
    const reset = String(Math.floor(Date.now() / 1000) + 3600);
    const github = replayGitHub([
      firstToken,
      historyExchange(GUIDE_PATH, [commit], { headers: { "x-ratelimit-remaining": "100", "x-ratelimit-reset": reset } }),
    ], INSTALLATION_TOKEN);

    expect(rows(await site.page(HISTORY))).toEqual(["19 Nov 2026, 10:00 UTC Grace Hopper grace on GitHub"]);
    const paused = await site.page(`${HISTORY}?page=1`);
    await site.settle();

    expect(text(paused!.html)).toContain("GitHub isn't answering right now, so this page's changes can't be shown.");
    expect(github.requests).toHaveLength(2);
  });

  // Proves a revision parameter reaches only commits on the content branch, and a page parameter only published pages.
  it.each([
    ["a hidden note", "/wiki/-/history/secret/"],
    ["a page that isn't published", "/wiki/-/history/nowhere/"],
    ["a revision that isn't a commit id", `${HISTORY}?to=HEAD~1`],
    ["a page number past the cap", `${HISTORY}?page=11`],
    ["a commit GitHub doesn't hold on the branch, as a fork's", `${HISTORY}?to=${"f".repeat(40)}`],
  ])("answers 404 for %s", async (_case, path) => {
    const site = await createSite();
    replayGitHub([
      firstToken,
      {
        request: { method: "GET", url: `${API}/compare/${"f".repeat(40)}...main?per_page=1` },
        authorization: `Bearer ${INSTALLATION_TOKEN}`,
        response: { status: 404, json: { message: "Not Found" } },
      } satisfies Exchange,
    ], INSTALLATION_TOKEN);
    expect(await site.page(path)).toBeUndefined();
  });
});

describe("/-/history/<page>?to=<sha>", () => {
  const ADDED = "---\ntitle: Guide\n---\n\n# Guide\n\nSet up the wiki.\n\nAsk on the forum.\n";
  const SAVED = "---\ntitle: Guide\n---\n\n# Guide\n\nSet up the wiki in five minutes.\n\nAsk on the forum.\n\n<script>alert(1)</script>\n<img src=\"x.png\" onerror=\"alert(1)\">\n";

  // Proves the diff shows what changed in the source line by line, and the newer revision rendered with the build's
  // Markdown steps, sanitized as the site sanitizes notes.
  it("shows what changed in the source, and the revision rendered and sanitized", async () => {
    const site = await createSite();
    const { added, saved } = guideCommits(await site.signUp(ADA));
    await site.push([added, saved]);
    replayGitHub([firstToken, historyExchange(GUIDE_PATH, [saved, added]), ...botLookup, ...backfill([saved, added])], INSTALLATION_TOKEN);
    await site.page(HISTORY);
    await site.settle();

    replayGitHub([contentExchange(GUIDE_PATH, saved.sha, SAVED), contentExchange(GUIDE_PATH, added.sha, ADDED)], INSTALLATION_TOKEN);
    const diff = await site.page(`${HISTORY}?to=${saved.sha}`);

    expect(diff?.title).toBe("Changes to Guide");
    // Each row's cells: the line before, the line after, the change, and the text.
    const lines = [...diff!.html.matchAll(/<tr data-kind="\w+">(.*?)<\/tr>/g)]
      .map(([, row]) => row!.split("</td>").map(text).filter(Boolean).join(" | "));
    expect(lines).toEqual([
      "4 | 4",
      "5 | 5 | # Guide",
      "6 | 6",
      "7 | −Removed | Set up the wiki.",
      "7 | +Added | Set up the wiki in five minutes.",
      "8 | 8",
      "9 | 9 | Ask on the forum.",
      "10 | +Added",
      "11 | +Added | <script>alert(1)</script>",
      "12 | +Added | <img src=\"x.png\" onerror=\"alert(1)\">",
    ]);
    const rendered = diff!.html.split('<div class="sv-prose sv-history-rendered">')[1]!;
    expect(rendered).toContain("Set up the wiki in five minutes.");
    expect(rendered).toMatch(/<h1 id="guide">Guide/);
    // Relative to the page, as on the site, and without its handler.
    expect(rendered).toContain('<img src="/wiki/guide/x.png">');
    expect(diff!.html).not.toMatch(/<script|onerror="/i);
  });

  // Proves a revision the build would have hidden shows nothing of its content, though the page is public now.
  it("never shows a revision the build would have hidden", async () => {
    const site = await createSite();
    const { added, saved } = guideCommits(await site.signUp(ADA));
    await site.push([added, saved]);
    replayGitHub([firstToken, historyExchange(GUIDE_PATH, [saved, added]), ...botLookup, ...backfill([saved, added])], INSTALLATION_TOKEN);
    await site.page(HISTORY);
    await site.settle();

    replayGitHub([
      contentExchange(GUIDE_PATH, saved.sha, ADDED),
      contentExchange(GUIDE_PATH, added.sha, "---\nprivate: true\n---\n\nThe launch date is the 3rd.\n"),
    ], INSTALLATION_TOKEN);
    const diff = await site.page(`${HISTORY}?from=${added.sha}&to=${saved.sha}`);

    expect(text(diff!.html)).toContain("One of these revisions wasn't public, so its content isn't shown.");
    expect(diff!.html).not.toContain("launch");
    expect(diff!.html).not.toContain("Ask on the forum");
  });
});

describe("/-/changes/", () => {
  // Proves Recent changes lists every change to a published page with its pages and author, and nothing of a note
  // the site hides: not a change to it alone, not its name, not the summary of a change that touched it.
  it("lists changes to published pages, and nothing of hidden ones", async () => {
    const site = await createSite();
    const { added, saved, forged } = guideCommits(await site.signUp(ADA));
    const hiddenOnly: TestCommit = { sha: "9".repeat(40), message: "Plan the secret launch", at: 50, author: GRACE, committer: GITHUB_WEB, files: [SECRET_PATH] };
    await site.push([added, saved, forged, hiddenOnly]);
    // The App's slug, with its JWT, before the reader's first installation token.
    const [app, bot] = botLookup;
    replayGitHub([app!, firstToken, bot!, ...backfill([hiddenOnly, forged, saved, added])], INSTALLATION_TOKEN);

    const changes = await site.page("/wiki/-/changes/");
    await site.settle();

    expect(changes?.title).toBe("Recent changes");
    expect(text(changes!.html)).toContain("19 November 2026");
    expect(rows(changes)).toEqual([
      "10:45 UTC Guide (changes, history) Ada Lovelace Fix typo",
      "10:30 UTC Guide (changes, history) Ada Lovelace @ada Added the time it takes.",
      "10:00 UTC Guide (changes, history) Grace Hopper grace on GitHub",
    ]);
    expect(changes!.html).toContain(`href="${HISTORY}?to=${saved.sha}">changes`);
    expect(changes!.html.toLowerCase()).not.toMatch(/secret|launch/);
  });
});

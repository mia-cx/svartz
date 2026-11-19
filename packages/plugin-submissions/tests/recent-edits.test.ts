/**
 * The Recent edits dashboard panel, rendered by the real dashboard over a mirror filled through the webhook route and
 * the edit route, on Miniflare's D1.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ago, COMMITS, createEditsSite, PANEL, REPO, seedEdits, sha, type EditsSite, type Viewer } from "./edits-harness";

const sites: EditsSite[] = [];
afterEach(async () => {
  for (const site of sites.splice(0)) await site.dispose();
});

async function site(): Promise<EditsSite> {
  const created = await createEditsSite();
  sites.push(created);
  return created;
}

/** The panel's HTML as `viewer` sees it at `path`, or `null` for the 404. */
async function panel(at: EditsSite, viewer: Viewer | null, path = PANEL): Promise<string | null> {
  const result = await at.page(viewer, path);
  return result && "html" in result ? result.html : null;
}

/** Each entry's HTML, newest first. */
const entries = (html: string) => [...html.matchAll(/<li class="svartz-submissions-edit">([\s\S]*?)<\/li>\n?(?=<li class="svartz-submissions-edit">|<\/ol>)/g)].map(([, body]) => body!);
/** The entry for commit `id`, by its diff link: the test commits' short SHAs are alike. */
const entryOf = (html: string, id: string) => entries(html).find((body) => body.includes(`/commit/${id}"`))!;
/** Each entry's heading: its summary, or its short SHA. */
const headings = (html: string) => [...html.matchAll(/id="svartz-submissions-edit-\d+">([^<]*)</g)].map(([, text]) => text);
/** What a reader of `html` reads, screen readers included, in one line. */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

describe("the Recent edits panel", () => {
  // Proves the gate: only a viewer holding submissions:pull-requests:read gets the panel or any page of it.
  it("answers only viewers who may see submissions, on every page", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    expect(await panel(wiki, "mod")).toContain("Recent edits");
    const older = `${PANEL}?before=${COMMITS.many}`;
    expect(await panel(wiki, "mod", older)).toContain("Fix a typo in Setup");
    for (const viewer of ["reader", null] as const) {
      expect(await panel(wiki, viewer)).toBeNull();
      expect(await panel(wiki, viewer, older)).toBeNull();
    }
  });

  // Proves the trust rule: an account is credited only from the site's own record of a save, never from git metadata.
  it("credits a site account only where the site recorded the save", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    const html = (await panel(wiki, "mod"))!;
    const by = Object.fromEntries(headings(html).map((heading, index) => [heading, entries(html)[index]!]));

    // A site account shows with its reputation; nobody here has earned any yet.
    expect(text(by["Edit content/guide.md"]!)).toContain("Ada Lovelace Reputation 0 @ada");
    expect(text(by["Add how long setup takes (#42)"]!)).toContain("Grace Hopper Reputation 0 @grace");
    // Ada's author address, the App as committer and Ada's trailer, with no record of the save: a plain git author.
    expect(by["Edit content/Places/Paris.md"]).toContain("Ada Lovelace (not on GitHub)");
    expect(by["Edit content/Places/Paris.md"]).not.toContain("@ada");
    expect(by["Rewrite the guide"]).toContain('<a href="https://github.com/mallory">mallory</a> on GitHub');
    expect(by["Rewrite the guide"]).not.toContain("Ada Lovelace");
    expect(by["Fix a typo in Setup"]).toContain("Charles Babbage (not on GitHub)");
    // Who someone is shows by name and handle only.
    for (const secret of [await wiki.accountId("ada"), await wiki.accountId("grace"), "@example.org", "noreply"]) expect(html).not.toContain(secret);
  });

  // Proves each entry links its pages and diff, and names nothing the site keeps back, even in a summary.
  it("links the pages and diff, and names only what the site publishes", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    const html = (await panel(wiki, "mod"))!;
    const [hidden, many] = entries(html);

    expect(headings(html)[1]).toBe(`Commit ${COMMITS.many.slice(0, 7)}`);
    for (const [title, href] of [["Guide", "/wiki/guide/"], ["Ada Lovelace", "/wiki/people/ada-lovelace/"], ["Expo", "/wiki/events/expo/"]]) {
      expect(many).toContain(`<a href="${href}">${title}</a>`);
    }
    expect(many).toContain("<li>images/map.png</li>");
    expect(many).toContain("<summary>3 more</summary>");
    expect(many).toContain("1 file the site doesn't publish");
    expect(many).toContain(`href="https://github.com/${REPO}/commit/${COMMITS.many}"`);

    expect(headings(html)[0]).toBe(`Commit ${COMMITS.hidden.slice(0, 7)}`);
    expect(hidden).toContain("1 file the site doesn't publish");
    expect(html).not.toContain("secret plans");
    expect(html).not.toContain("private/plans");
  });

  // Proves a summary shows only when every file the commit changed is published: one published page doesn't let a subject name a private one.
  it("withholds the summary of a commit that also changed a file the site keeps back", async () => {
    const wiki = await site();
    const mixed = sha(11);
    await wiki.push([{
      id: mixed, message: "Update private/acquisition-target.md and the guide", at: ago(5),
      author: { name: "Octocat", email: "octocat@example.org", username: "octocat" },
      modified: ["content/guide.md", "content/private/acquisition-target.md"],
    }]);
    const html = (await panel(wiki, "mod"))!;
    expect(headings(html)).toEqual([`Commit ${mixed.slice(0, 7)}`]);
    expect(entries(html)[0]).toContain('<a href="/wiki/guide/">Guide</a>');
    expect(entries(html)[0]).toContain("1 file the site doesn't publish");
    expect(html).not.toContain("acquisition-target");
  });

  // Proves commit text is shown as text: a message or name can't add markup to the dashboard.
  it("escapes what a commit says", async () => {
    const wiki = await site();
    await wiki.push([{
      id: sha(9), message: `<img src=x onerror=alert(1)> "quoted"`, at: ago(5),
      author: { name: "<script>alert(1)</script>", email: "x@example.org" }, modified: ["content/guide.md"],
    }]);
    const html = (await panel(wiki, "ada"))!;
    expect(html).toContain("&#60;img src=x onerror=alert(1)&#62; &#34;quoted&#34;");
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62; (not on GitHub)");
    expect(html).not.toMatch(/<img|<script/);
  });

  // Proves paging: newest first, 25 to a page, older ones a link away, and a malformed cursor answers nothing.
  it("pages through commits, newest first", async () => {
    const wiki = await site();
    await wiki.push(Array.from({ length: 27 }, (_, index) => ({
      id: sha(100 + index), message: `Edit ${index + 1}`, at: ago(100 - index),
      author: { name: "Ada", email: "a@example.org", username: "ada" }, modified: ["content/guide.md"],
    })));
    const first = (await panel(wiki, "ada"))!;
    expect(headings(first)).toEqual(Array.from({ length: 25 }, (_, index) => `Edit ${27 - index}`));
    expect(first).not.toContain("Newest edits");
    const older = first.match(/<a href="([^"]+)">Older edits<\/a>/)![1]!;
    expect(older).toBe(`${PANEL}?before=${sha(102)}`);

    const second = (await panel(wiki, "ada", older))!;
    expect(headings(second)).toEqual(["Edit 2", "Edit 1"]);
    expect(second).toContain(`<a href="${PANEL}">Newest edits</a>`);
    expect(second).not.toContain("Older edits");
    expect(await panel(wiki, "ada", `${PANEL}?before=1%20OR%201=1`)).toBeNull();
  });

  // Proves a full page stays well within one Worker invocation's D1 allowance (50 queries on Workers Free, a batch
  // counting as one), the gate, listing, deploy states and the compares after the answer included, whatever state its
  // commits are in: the deploy states of every commit cost one batch, not a query or two each.
  it("renders a full page within a free Worker's D1 allowance", async () => {
    const wiki = await site();
    const page = Array.from({ length: 26 }, (_, index) => sha(200 + index));
    await wiki.push(page.map((id, index) => ({
      id, message: `Edit ${index + 1}`, at: ago(100 - index),
      author: { name: "Ada", email: "a@example.org", username: "ada" }, modified: ["content/guide.md"],
    })));
    // Runs at some of the page's own commits, each state once, and later builds at commits outside the vault, which
    // the page's every commit has yet to be compared with.
    await wiki.run(1, page[1]!, ago(98), "completed", "success");
    await wiki.run(2, page[2]!, ago(97), "in_progress");
    await wiki.run(3, page[3]!, ago(96), "completed", "failure");
    await wiki.run(4, sha(900), ago(3), "completed", "success");
    await wiki.run(5, sha(901), ago(2), "in_progress");
    // The first view runs the reconcile poll, which costs the same on any page that reads the mirror; count a view after it.
    await panel(wiki, "mod");
    await wiki.settle();

    wiki.d1.count = 0;
    const compares = wiki.github.requests.length;
    const html = (await panel(wiki, "mod"))!;
    await wiki.settle();
    expect(headings(html)).toHaveLength(25);
    expect(wiki.github.requests.slice(compares).filter((request) => request.includes("/compare/"))).toHaveLength(3);
    // 15 today: the session, the dashboard's one check for every panel, the panel's own, the page of commits and
    // their stages, and six for the three compares. One query per commit would add 25, and one per panel four.
    expect(wiki.d1.count).toBeLessThanOrEqual(17);
  });

  // Proves deploy states come from the mirror alone, and a commit turns live once GitHub, asked after the answer, says a later successful build holds it.
  it("shows how far each commit has got toward live, without waiting on GitHub", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    wiki.github.down = true;
    const html = (await panel(wiki, "mod"))!;
    const stage = (heading: string) => entries(html)[headings(html).indexOf(heading)]!.match(/data-stage="\w+">([^<]+)</)![1];
    expect(stage("Edit content/guide.md")).toBe("Live");
    expect(stage("Rewrite the guide")).toBe("Building");
    expect(entryOf(html, COMMITS.many)).toContain('data-stage="failed">Build failed<');
    expect(stage("Fix a typo in Setup")).toBe("Not live yet");
    await wiki.settle();

    wiki.github.down = false;
    await wiki.run(4, COMMITS.hidden, ago(1), "completed", "success");
    wiki.github.compare.set(`${COMMITS.local}...${COMMITS.hidden}`, "ahead");
    const before = (await panel(wiki, "mod"))!;
    expect(entries(before)[headings(before).indexOf("Fix a typo in Setup")]).toContain("Not live yet");
    await wiki.settle();
    expect(wiki.github.requests).toContain(`GET /repos/${REPO}/compare/${COMMITS.local}...${COMMITS.hidden}?per_page=1`);
    const after = (await panel(wiki, "mod"))!;
    expect(entries(after)[headings(after).indexOf("Fix a typo in Setup")]).toContain('data-stage="live">Live<');
  });
});

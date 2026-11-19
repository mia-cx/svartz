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
/** Each entry's heading: its summary, or its short SHA. */
const headings = (html: string) => [...html.matchAll(/id="svartz-submissions-edit-\d+">([^<]*)</g)].map(([, text]) => text);

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

  // Proves the trust rule: an account is credited only from the site's own record or the App's bot, never a bare trailer.
  it("credits a site account only where the site can vouch for it", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    const html = (await panel(wiki, "mod"))!;
    const by = Object.fromEntries(headings(html).map((heading, index) => [heading, entries(html)[index]!]));

    expect(by["Edit content/guide.md"]).toContain('<span class="sv-account-name">Ada Lovelace</span> <span class="sv-account-muted">@ada</span>');
    expect(by["Edit content/Places/Paris.md"]).toContain('<span class="sv-account-name">Grace Hopper</span>');
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

    expect(many).toContain("Link every person, place and event");
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

  // Proves deploy states come from the mirror alone, and a commit turns live once GitHub, asked after the answer, says a later successful build holds it.
  it("shows how far each commit has got toward live, without waiting on GitHub", async () => {
    const wiki = await site();
    await seedEdits(wiki);
    wiki.github.down = true;
    const html = (await panel(wiki, "mod"))!;
    const stage = (heading: string) => entries(html)[headings(html).indexOf(heading)]!.match(/data-stage="\w+">([^<]+)</)![1];
    expect(stage("Edit content/guide.md")).toBe("Live");
    expect(stage("Rewrite the guide")).toBe("Building");
    expect(stage("Link every person, place and event")).toBe("Build failed");
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

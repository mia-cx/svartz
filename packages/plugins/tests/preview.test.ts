import { describe, expect, it } from "vitest";
import { renderPreview, type PreviewOptions } from "../src/preview";

const OPTIONS: PreviewOptions = {
  notes: [
    { slug: "people/ada-lovelace", path: "People/Ada Lovelace.md", href: "/wiki/people/ada-lovelace/", title: "Ada Lovelace", aliases: ["Ada"] },
    { slug: "guide", path: "Guide.md", href: "/wiki/guide/", title: "Guide" },
  ],
  linkResolution: "shallowest",
  path: "Guide.md",
  base: "/docs",
  mountPath: "/wiki",
  attachments: ["Assets/chart.png", "Assets/logo 1.png", "Assets/talk.mp3", "Assets/demo.mp4", "Assets/data.csv"],
};

const render = (markdown: string, options: Partial<PreviewOptions> = {}) => renderPreview(markdown, { ...OPTIONS, ...options });

describe("renderPreview", () => {
  it.each(["Ada", "diagram.png", "missing"])("keeps %s embed examples verbatim in inline, fenced and indented code", async (target) => {
    const embed = `![[${target}]]`;
    const html = await render([
      `\`${embed}\``,
      `\`\`literal \` ${embed}\`\``,
      `\`\`\`\n${embed}\n\`\`\``,
      `~~~\n${embed}\n~~~`,
      `    ${embed}`,
    ].join("\n\n"));

    expect(html).toContain(`<code>${embed}</code>`);
    expect(html).toContain(`<code>literal \` ${embed}</code>`);
    expect(html.split(`<pre><code>${embed}\n</code></pre>`)).toHaveLength(4);
    expect(html).not.toContain("svartz-embed");
  });

  it("finds code in a table as the renderer does: backticks in separate cells protect nothing", async () => {
    const html = await render("| Before | Embed | After | Code |\n| - | - | - | - |\n| ` | ![[Ada]] | ` | `![[Ada]]` |\n");

    expect(html).toContain('data-embed="people/ada-lovelace"');
    expect(html).toContain("<code>![[Ada]]</code>");
  });

  it("links published notes by name, alias, heading and Markdown path", async () => {
    const html = await render("[[Ada Lovelace]], [[Ada|the countess]], [[Ada Lovelace#Early life]] and [her](People/Ada%20Lovelace.md).");

    expect(html).toContain('<a href="/docs/wiki/people/ada-lovelace/">Ada Lovelace</a>');
    expect(html).toContain('<a href="/docs/wiki/people/ada-lovelace/">the countess</a>');
    expect(html).toContain('<a href="/docs/wiki/people/ada-lovelace/#early-life">Ada Lovelace</a>');
    expect(html).toContain('<a href="/docs/wiki/people/ada-lovelace/">her</a>');
  });

  it("shows a wikilink to no published note unresolved, as the site does", async () => {
    expect(await render("See [[Charles Babbage]].")).toContain(
      '<span class="svartz-unresolved-link" role="link" aria-disabled="true">Charles Babbage</span>',
    );
  });

  it("renders callouts, highlights, GFM and anchored headings, without the frontmatter", async () => {
    const html = await render("---\ntitle: Guide\n---\n\n## Setup\n\n> [!warning]- Careful\n> Mind the ==gap==.\n\n| a |\n| - |\n| 1 |\n\n- [x] done\n");

    expect(html).not.toContain("title: Guide");
    expect(html).toContain('<h2 id="setup">');
    expect(html).toContain('class="heading-anchor"');
    expect(html).toContain('data-callout="warning" data-callout-fold="closed"');
    expect(html).toContain("<strong>Careful</strong>");
    expect(html).toContain("<mark>gap</mark>");
    expect(html).toContain("<table>");
    expect(html).toContain('<input type="checkbox" checked disabled>');
  });

  it("frames a note embed around its link, and leaves an embed of no published file as code", async () => {
    const html = await render("![[Ada Lovelace]]\n\n![[diagram.png]]");

    expect(html).toContain('<div class="svartz-embed" data-embed="people/ada-lovelace"><p class="svartz-embed-source"><a href="/docs/wiki/people/ada-lovelace/">Ada Lovelace</a></p></div>');
    expect(html).toContain("<code>![[diagram.png]]</code>");
  });

  it.each([
    ["an image", "![[chart.png|A chart]]", '<img src="/docs/wiki/Assets/chart.png" alt="A chart">'],
    ["audio", "![[talk.mp3]]", '<audio controls src="/docs/wiki/Assets/talk.mp3"></audio>'],
    ["video", "![[demo.mp4]]", '<video controls src="/docs/wiki/Assets/demo.mp4"></video>'],
    ["any other file as a link", "![[data.csv|Data]]", '<a href="/docs/wiki/Assets/data.csv">Data</a>'],
  ])("embeds %s by its name, as the build does", async (_kind, markdown, expected) => {
    expect(await render(markdown, { path: "People/Guide.md" })).toContain(expected);
  });

  it("links a wikilink to an attachment by its name", async () => {
    expect(await render("[[logo 1.png|Logo]]")).toContain('<a href="/docs/wiki/Assets/logo%201.png">Logo</a>');
  });

  it("renders CRLF callouts with a title, fold marker and body exactly like LF callouts", async () => {
    const source = "> [!warning]- Read this first\n> Callout body\n";
    const expected = await render(source);
    expect(expected).toContain('data-callout="warning" data-callout-fold="closed"');
    expect(expected).toContain("<strong>Read this first</strong>");
    expect(expected).toContain("Callout body");
    expect(await render(source.replaceAll("\n", "\r\n"))).toBe(expected);
  });

  it("keeps code as plain code, links inside it included", async () => {
    const html = await render("```mermaid\ngraph TD; [[Ada]]\n```");

    expect(html).toContain('<pre><code class="language-mermaid">graph TD; [[Ada]]\n</code></pre>');
  });

  it("finds an attachment by a name no other attachment has, as Obsidian's shortest links write it", async () => {
    const html = await render("![chart](chart.png) ![logo](../Assets/logo%201.png) #draft", { path: "People/New Page.md" });

    expect(html).toContain('src="/docs/wiki/Assets/chart.png"');
    expect(html).toContain('src="/docs/wiki/Assets/logo%201.png"');
    expect(html).toContain('href="/docs/wiki/tags/draft/"');
  });

  it("finds an attachment from the note's folder first, in any case, keeping its query", async () => {
    const attachments = ["People/photos/ada.png", "Archive/ada.png"];
    const html = await render("![Ada](Photos/Ada.PNG?v=2)", { path: "People/Guide.md", attachments });

    expect(html).toContain('src="/docs/wiki/People/photos/ada.png?v=2"');
  });

  it("leaves a name two attachments share unresolved, as the site does", async () => {
    const html = await render("![logo](logo.png)", { attachments: ["Assets/logo.png", "Archive/logo.png"] });

    // Unresolved, the URL stays relative to the note's page.
    expect(html).toContain('src="/docs/wiki/guide/logo.png"');
  });

  it("leaves a file the site doesn't publish unresolved, as Markdown and as an embed", async () => {
    const html = await render("![plan](plan.png)\n\n![[plan.png]]");

    expect(html).toContain('src="/docs/wiki/guide/plan.png"');
    expect(html).toContain("<code>![[plan.png]]</code>");
  });
});

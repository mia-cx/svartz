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

  it("frames a note embed around its link, and leaves an attachment embed as code", async () => {
    const html = await render("![[Ada Lovelace]]\n\n![[diagram.png]]");

    expect(html).toContain('<div class="svartz-embed" data-embed="people/ada-lovelace"><p class="svartz-embed-source"><a href="/docs/wiki/people/ada-lovelace/">Ada Lovelace</a></p></div>');
    expect(html).toContain("<code>![[diagram.png]]</code>");
  });

  it("keeps code as plain code, links inside it included", async () => {
    const html = await render("```mermaid\ngraph TD; [[Ada]]\n```");

    expect(html).toContain('<pre><code class="language-mermaid">graph TD; [[Ada]]\n</code></pre>');
  });

  it("resolves relative attachment URLs from the note's folder, where the build publishes attachments", async () => {
    const html = await render("![chart](chart.png) ![logo](../Assets/logo%201.png) #draft", { path: "People/New Page.md" });

    expect(html).toContain('src="/docs/wiki/People/chart.png"');
    expect(html).toContain('src="/docs/wiki/Assets/logo%201.png"');
    expect(html).toContain('href="/docs/wiki/tags/draft/"');
  });
});

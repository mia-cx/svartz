import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import rehypePrettyCode from "rehype-pretty-code";
import { compileContent } from "../src/internal/compile-content";
import { renderMarkdownTree } from "../src/internal/render-markdown";
import { transformOfm } from "../src/transform-ofm";
import type { PluginContext } from "@svartz/core";
import rehypePrettyCode from "rehype-pretty-code";

const ctx = { compiler: { remarkPlugins: [], rehypePlugins: [], svxSourceTransforms: [], browserResources: new Map() } } as unknown as PluginContext;

describe("code blocks", () => {
  const withSyntax = () => {
    const syntaxCtx = { compiler: { remarkPlugins: [], rehypePlugins: [], browserResources: new Map() } } as unknown as PluginContext;
    syntaxCtx.compiler.rehypePlugins.push([rehypePrettyCode, { theme: "github-dark", keepBackground: false }]);
    return syntaxCtx;
  };

  it("keeps fence metadata through raw HTML parsing, so titles and line highlights render", async () => {
    const markdown = '```ts title="src/a.ts" {2}\nconst a = 1;\nconst b = 2;\n```';
    const content = compileContent(await renderMarkdownTree(withSyntax(), markdown));
    expect(content).toContain("src/a.ts");
    expect(content).toContain("data-highlighted-line");
  });

  it("wraps the highlighted figure in the slot and leaves a literal <pre> for whitespace", async () => {
    const content = compileContent(await renderMarkdownTree(withSyntax(), "```ts\nif (a) {\n  b();\n}\n```"));
    expect(content).toMatch(/^<contentComponents\.codeBlock [^>]*"tag":"figure"/);
    expect(content).toContain("<pre");

    const plain = compileContent(await renderMarkdownTree(ctx, "```\n  indented\n```"));
    expect(plain).toMatch(/<contentComponents\.codeBlock [^>]*"tag":"pre"[^>]*><pre/);
  });
});

describe("inert Markdown content compilation", () => {
  it("passes the highlighted language to the code-block slot", async () => {
    const context = {
      compiler: { remarkPlugins: [], rehypePlugins: [[rehypePrettyCode, { theme: "github-dark-default" }]], svxSourceTransforms: [], browserResources: new Map() },
    } as unknown as PluginContext;
    const content = compileContent(await renderMarkdownTree(context, "```typescript\nconst x = 1\n```"));
    expect(content).toContain('"language":"typescript"');
  });

  it("passes an ordinary fenced language to the code-block slot", async () => {
    const content = compileContent(await renderMarkdownTree(ctx, "```ts\nconst x = 1\n```"));
    expect(content).toContain('"language":"ts"');
  });

  it("keeps a callout title separate from its first body paragraph", async () => {
    const file = { path: "note.md", slug: "note", extension: ".md", content: "> [!note] Read this\n> First line" };
    const context = { ...ctx, config: { theme: { base: "minimal" } }, files: [file] } as unknown as PluginContext;
    transformOfm().transformOfm!.run(context);
    const tree = await renderMarkdownTree(context, file.content);
    const quote = tree.children.find((node) => node.type === "element" && node.tagName === "blockquote");
    expect(quote?.type === "element" && quote.children.filter((node) => node.type === "element" && node.tagName === "p")).toHaveLength(2);
  });

  it("compiles Mermaid fences as inert diagram markup with a browser renderer", async () => {
    const file = { path: "note.md", slug: "note", extension: ".md", content: "```mermaid\ngraph TD\nA{Choice} --> B\n```" };
    const context = { config: { theme: { base: "minimal" } }, files: [file], meta: new Map() } as unknown as PluginContext;
    transformOfm().transformOfm!.run(context);
    const content = compileContent(await renderMarkdownTree(context, file.content));
    expect(content).toContain('svartz-mermaid');
    expect(content).toContain('A&#123;Choice&#125;');
    expect(context.compiler?.browserResources.get("core:mermaid")?.importId).toBe("@svartz/plugins/browser-mermaid");
  });

  it("offers all five override slots and keeps authored Svelte expressions inert", async () => {
    const markdown = [
      "# Example",
      "",
      '> <span class="callout-marker" data-callout="note"></span> **Read this**',
      "> body",
      "",
      "```js",
      "const value = 1",
      "```",
      "",
      "![alt](image.png) [link](https://example.com)",
      "",
      '<div class="svartz-embed" data-embed="other">Other</div>',
      "",
      '{dangerous()} <script>alert(1)</script> <svelte:head><title>Injected</title></svelte:head> <a href="javascript:alert(1)" onclick="alert(2)">unsafe</a>',
    ].join("\n");
    const content = compileContent(await renderMarkdownTree(ctx, markdown));

    for (const slot of ["callout", "codeBlock", "image", "link", "embed"]) {
      expect(content).toContain(`<contentComponents.${slot}`);
    }
    expect(content).toContain("&#123;dangerous()&#125;");
    expect(content).toContain('"title":"Read this"');
    expect(content).toContain('"data-embed":"other"');
    expect(content).not.toContain("<script>");
    expect(content).not.toContain("<svelte:head");
    expect(content).not.toContain("javascript:alert");
    expect(content).not.toContain("onclick");
    expect(() => compile(`<script>let { contentComponents } = $props();</script>${content}`, {
      filename: "inert.svelte", generate: "server",
    })).not.toThrow();
  });

  it("matches the embed class as a complete token", async () => {
    const content = compileContent(await renderMarkdownTree(ctx,
      '<div class="not-svartz-embed">Ordinary</div>\n<div class="other svartz-embed">Embedded</div>'));
    expect(content.match(/<contentComponents\.embed/g)).toHaveLength(1);
    expect(content).toContain("Ordinary");
  });
});

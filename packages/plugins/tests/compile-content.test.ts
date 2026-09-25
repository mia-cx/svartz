import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import { compileContent } from "../src/internal/compile-content";
import { renderMarkdownTree } from "../src/internal/render-markdown";
import type { PluginContext } from "@svartz/core";

const ctx = { compiler: { remarkPlugins: [], rehypePlugins: [], browserResources: new Map() } } as unknown as PluginContext;

describe("inert Markdown content compilation", () => {
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
});

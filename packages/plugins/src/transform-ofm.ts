/**
 * core:transform-ofm — Obsidian Flavored Markdown transforms.
 *
 * Handles the lowest-risk text-level OFM features before mdsvex compilation:
 * comments, inline highlights, and callout markers.
 */

import { definePlugin, getCompilerContributions } from "@svartz/core";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { transformMarkdown } from "./internal/ofm";

export { transformInlineTags, transformMarkdown } from "./internal/ofm";

const markdownParser = unified().use(remarkParse);

function escapeDiagram(value: string): string {
  return value.replace(/[&<>"'{}]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    "{": "&#123;", "}": "&#125;",
  })[character]!);
}

function hasMermaid(markdown: string): boolean {
  let found = false;
  visit(markdownParser.parse(markdown), "code", (node) => {
    if (node.lang?.toLowerCase() === "mermaid") found = true;
  });
  return found;
}

function remarkMermaid() {
  return (tree: ReturnType<typeof markdownParser.parse>) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang?.toLowerCase() !== "mermaid" || index === undefined || !parent) return;
      parent.children[index] = {
        type: "html",
        value: `<pre class="svartz-mermaid">${escapeDiagram(node.value)}</pre>`,
      };
    });
  };
}


export const transformOfm = definePlugin(() => ({
  id: "core:transform-ofm",

  transformOfm: {
    run(ctx) {
      const routes = ctx.config.theme.routes as { tags?: string } | undefined;
      let mermaid = false;
      for (const file of ctx.files) {
        if (!file.extension || ![".md", ".mdx", ".svx"].includes(file.extension)) continue;

        const transformed = transformMarkdown(file.content, file.slug, routes?.tags ?? "tags", file.extension === ".svx");
        file.content = transformed.content;
        file.inlineTags = transformed.tags;
        mermaid ||= hasMermaid(file.content);
      }
      if (mermaid) {
        const compiler = getCompilerContributions(ctx);
        compiler.remarkPlugins.push(remarkMermaid);
        compiler.browserResources.set("core:mermaid", {
          id: "core:mermaid", kind: "script", importId: "@svartz/plugins/browser-mermaid",
        });
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_OFM_ID = "core:transform-ofm" as const;

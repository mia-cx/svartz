import { getCompilerContributions, type PluginContext } from "@svartz/core";
import type { Root } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

function createMarkdownProcessor(ctx: PluginContext) {
  const compiler = getCompilerContributions(ctx);
  return unified()
    .use(remarkParse)
    .use({ plugins: compiler.remarkPlugins })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { ariaHidden: true, tabIndex: -1, className: ["heading-anchor"] },
    })
    .use({ plugins: compiler.rehypePlugins });
}

/** Parse inert Markdown with the active vault's compiler plugins. */
export async function renderMarkdownTree(ctx: PluginContext, content: string): Promise<Root> {
  const processor = createMarkdownProcessor(ctx);
  return await processor.run(processor.parse(content)) as Root;
}

/** Render inert Markdown HTML, optionally resolving links against the published note URL. */
export async function renderMarkdown(ctx: PluginContext, content: string, baseUrl?: string): Promise<string> {
  if (baseUrl) {
    const tree = await renderMarkdownTree(ctx, content);
    visit(tree, "element", (node) => {
      for (const name of ["href", "src"] as const) {
        const value = node.properties[name];
        if (typeof value === "string" && value) node.properties[name] = new URL(value, baseUrl).href;
      }
    });
    return toHtml(tree);
  }
  const processor = createMarkdownProcessor(ctx).use(rehypeStringify);
  return String(await processor.process(content));
}

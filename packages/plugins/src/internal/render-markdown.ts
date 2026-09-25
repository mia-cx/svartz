import { getCompilerContributions, type PluginContext } from "@svartz/core";
import type { Root } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

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

/** Render inert Markdown HTML for feeds and other text-only outputs. */
export async function renderMarkdown(ctx: PluginContext, content: string): Promise<string> {
  const processor = createMarkdownProcessor(ctx).use(rehypeStringify);
  return String(await processor.process(content));
}

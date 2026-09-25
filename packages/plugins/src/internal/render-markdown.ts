import { getCompilerContributions, type PluginContext } from "@svartz/core";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/** Render inert Markdown with the active vault's compiler plugins. */
export async function renderMarkdown(ctx: PluginContext, content: string): Promise<string> {
  const compiler = getCompilerContributions(ctx);
  const markdown = unified()
    .use(remarkParse)
    .use({ plugins: compiler.remarkPlugins })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { ariaHidden: true, tabIndex: -1, className: ["heading-anchor"] },
    })
    .use({ plugins: compiler.rehypePlugins })
    .use(rehypeStringify);
  return String(await markdown.process(content));
}

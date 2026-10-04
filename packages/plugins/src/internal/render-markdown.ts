import { getCompilerContributions, type PluginContext } from "@svartz/core";
import type { Element, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

function absoluteOrAuthored(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

const ASCII_WHITESPACE = /[\t\n\f\r ]/;

/** Keep data URLs intact: their embedded comma is part of the URL, not a candidate separator. */
function resolveSrcset(value: string, baseUrl: string): string {
  const candidates: string[] = [];
  let position = 0;
  while (position < value.length) {
    while (ASCII_WHITESPACE.test(value[position] ?? "") || value[position] === ",") position++;
    if (position >= value.length) break;
    const start = position;
    while (position < value.length && !ASCII_WHITESPACE.test(value[position]!)) position++;
    const rawUrl = value.slice(start, position);
    const url = rawUrl.replace(/,+$/, "");
    const hasSeparator = url.length !== rawUrl.length;
    const descriptorStart = position;
    if (!hasSeparator) {
      while (position < value.length && value[position] !== ",") position++;
    }
    const descriptor = value.slice(descriptorStart, position).trim();
    if (position < value.length) position++;
    candidates.push(`${absoluteOrAuthored(url, baseUrl)}${descriptor ? ` ${descriptor}` : ""}`);
  }
  return candidates.join(", ");
}

/**
 * rehype-raw rebuilds the tree and drops `data`, including a code fence's meta
 * (`title="…" {2-4}`). Keep it as the `metastring` property rehype-pretty-code reads.
 */
function preserveCodeMeta() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const meta = (node.data as { meta?: string } | undefined)?.meta;
      if (node.tagName === "code" && meta) node.properties.metastring = meta;
    });
  };
}

function createMarkdownProcessor(ctx: PluginContext) {
  const compiler = getCompilerContributions(ctx);
  return unified()
    .use(remarkParse)
    .use({ plugins: compiler.remarkPlugins })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(preserveCodeMeta)
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
        if (typeof value === "string" && value) node.properties[name] = absoluteOrAuthored(value, baseUrl);
      }
      const srcset = node.properties.srcSet;
      if (typeof srcset === "string" && srcset) node.properties.srcSet = resolveSrcset(srcset, baseUrl);
    });
    return toHtml(tree);
  }
  const processor = createMarkdownProcessor(ctx).use(rehypeStringify);
  return String(await processor.process(content));
}

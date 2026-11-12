/** How notes' Markdown becomes an HTML tree, for the build and the editor preview alike. Browser-safe. */
import type { Element, Root } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";
import { visit } from "unist-util-visit";

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

/**
 * Markdown to an inert HTML tree, as notes compile: `remarkPlugins` on the Markdown, then raw HTML parsed, headings
 * slugged and anchored, then `rehypePlugins`. The build passes the vault's compiler plugins; the editor preview passes
 * the browser-safe ones.
 */
export function markdownProcessor(remarkPlugins: PluggableList, rehypePlugins: PluggableList = []) {
  return unified()
    .use(remarkParse)
    .use({ plugins: remarkPlugins })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(preserveCodeMeta)
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { ariaHidden: true, tabIndex: -1, className: ["heading-anchor"] },
    })
    .use({ plugins: rehypePlugins });
}

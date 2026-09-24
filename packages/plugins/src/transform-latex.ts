/**
 * core:transform-latex — LaTeX/math transforms.
 *
 * Contributes math parsing, KaTeX rendering, and its browser stylesheet.
 * Source stays as Markdown until after embeds and indexing.
 */

import { createRequire } from "node:module";
import { definePlugin, getCompilerContributions } from "@svartz/core";
import katex, { type KatexOptions } from "katex";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdown = unified().use(remarkParse).use(remarkMath);
const KATEX_CSS = createRequire(import.meta.url).resolve("katex/dist/katex.min.css");

type LatexOptions = Omit<KatexOptions, "displayMode"> & { disabled?: boolean };

function renderSvxMath(source: string, options: Omit<KatexOptions, "displayMode">): string {
  const replacements: { start: number; end: number; html: string }[] = [];
  visit(markdown.parse(source), (node) => {
    if (node.type !== "math" && node.type !== "inlineMath") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    replacements.push({
      start,
      end,
      html: katex.renderToString(node.value, {
        throwOnError: false,
        ...options,
        displayMode: node.type === "math",
      }),
    });
  });
  let rendered = source;
  for (const { start, end, html } of replacements.reverse()) {
    rendered = rendered.slice(0, start) + html + rendered.slice(end);
  }
  return rendered;
}

/** Render public math with KaTeX and declare its stylesheet. */
export const transformLatex = (options: LatexOptions = {}) => {
  const { disabled, ...katexOptions } = options;
  return definePlugin(() => ({
    id: "core:transform-latex",

    transformLatex: {
      run(ctx) {
        const used = ctx.files.some((file) => {
          let found = false;
          visit(markdown.parse(file.content), (node) => {
            if (node.type === "math" || node.type === "inlineMath") found = true;
          });
          return found;
        });
        if (!used) return;
        const compiler = getCompilerContributions(ctx);
        compiler.remarkPlugins.push(remarkMath);
        compiler.rehypePlugins.push([rehypeKatex, { throwOnError: false, ...katexOptions }]);
        compiler.svxSourceTransforms.push((source) => renderSvxMath(source, katexOptions));
        compiler.browserResources.set("core:katex-css", {
          id: "core:katex-css",
          kind: "css",
          importId: KATEX_CSS,
        });
      },
      options: { fatal: true },
    },
  }))({ disabled });
};

export const TRANSFORM_LATEX_ID = "core:transform-latex" as const;

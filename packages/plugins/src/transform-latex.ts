/**
 * core:transform-latex — LaTeX/math transforms.
 *
 * Processes $inline$ and $$block$$ math expressions.
 * Contributes math parsing, KaTeX rendering, and its browser stylesheet.
 */

import { createRequire } from "node:module";
import { definePlugin, getCompilerContributions } from "@svartz/core";
import katex, { type KatexOptions } from "katex";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdown = unified().use(remarkParse).use(remarkMath);
const KATEX_CSS = createRequire(import.meta.url).resolve("katex/dist/katex.min.css");

type LatexOptions = Omit<KatexOptions, "displayMode">;

/** Render public math with KaTeX and declare its stylesheet. */
export const transformLatex = (options: LatexOptions = {}) => definePlugin(() => ({
  id: "core:transform-latex",

  transformLatex: {
    run(ctx) {
      let used = false;
      for (const file of ctx.files) {
        const replacements: { start: number; end: number; html: string }[] = [];
        visit(markdown.parse(file.content), (node) => {
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
        for (const replacement of replacements.reverse()) {
          file.content = file.content.slice(0, replacement.start) +
            replacement.html + file.content.slice(replacement.end);
        }
        used ||= replacements.length > 0;
      }
      if (!used) return;
      getCompilerContributions(ctx).browserResources.set("core:katex-css", {
        id: "core:katex-css",
        kind: "css",
        importId: KATEX_CSS,
      });
    },
    options: { fatal: true },
  },
}))();

export const TRANSFORM_LATEX_ID = "core:transform-latex" as const;

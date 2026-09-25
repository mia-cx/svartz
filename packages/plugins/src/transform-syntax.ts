/**
 * core:transform-syntax — Syntax highlighting transforms.
 *
 * Processes fenced code blocks for syntax highlighting.
 * Contributes rehype-pretty-code when public notes contain code.
 */

import { definePlugin, getCompilerContributions } from "@svartz/core";
import rehypePrettyCode, { type Options as SyntaxOptions } from "rehype-pretty-code";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdown = unified().use(remarkParse);

function usesCode(content: string): boolean {
  let found = false;
  visit(markdown.parse(content), (node) => {
    if (node.type === "code" || node.type === "inlineCode") found = true;
  });
  return found;
}

/** Add syntax highlighting for public notes with code. */
export const transformSyntax = (options: SyntaxOptions = {}) => definePlugin(() => ({
  id: "core:transform-syntax",

  transformSyntax: {
    run(ctx) {
      if (!ctx.files.some((file) => usesCode(file.content))) return;
      getCompilerContributions(ctx).rehypePlugins.push([
        rehypePrettyCode,
        { theme: "github-dark-default", keepBackground: false, ...options },
      ]);
    },
    options: { fatal: true },
  },
}))();

export const TRANSFORM_SYNTAX_ID = "core:transform-syntax" as const;

/** Optional bibliography-backed citations for published Markdown notes. */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { definePlugin, getCompilerContributions } from "@svartz/core";
import type { Root } from "hast";
import rehypeCitation from "rehype-citation";
import { visit } from "unist-util-visit";

export interface CitationOptions {
  bibliographyFile?: string | readonly string[];
  suppressBibliography?: boolean;
  linkCitations?: boolean;
  csl?: string;
}

function markBibliographyLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName === "a" && String(node.properties.href ?? "").startsWith("#bib")) {
        node.properties.dataNoPopover = true;
      }
    });
  };
}

/** Resolve bibliography paths from the vault, independent of the host process cwd. */
export const citations = (options: CitationOptions = {}) => definePlugin(() => ({
  id: "core:citations",
  transformGfm: {
    run(ctx) {
      const files = options.bibliographyFile ?? "./bibliography.bib";
      const bibliography = (Array.isArray(files) ? files : [files]).map((file) => {
        const absolute = resolve(ctx.config.path, file);
        if (!existsSync(absolute)) throw new Error(`Citation bibliography not found: ${absolute}`);
        return relative(ctx.config.path, absolute);
      });
      getCompilerContributions(ctx).rehypePlugins.push([
        rehypeCitation,
        {
          bibliography,
          path: ctx.config.path,
          csl: options.csl ?? "apa",
          lang: "en-US",
          suppressBibliography: options.suppressBibliography ?? false,
          linkCitations: options.linkCitations ?? false,
        },
      ], markBibliographyLinks);
    },
    options: { fatal: true, enforce: "post" },
  },
}))();

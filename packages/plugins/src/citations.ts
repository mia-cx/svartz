/** Optional bibliography-backed citations for published Markdown notes. */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { definePlugin, getCompilerContributions } from "@svartz/core";
import type { Root } from "hast";
import rehypeCitation from "rehype-citation";
import type { Processor } from "unified";
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

type CitationStepOptions = NonNullable<Parameters<typeof rehypeCitation>[0]> & { readonly bibliography: readonly string[] };

/**
 * rehype-citation with options of its own for every note it compiles: it joins `path` onto the `bibliography` it is
 * given in place, so the next note would look for the file below the vault twice over.
 */
function citationStep(this: Processor, options: CitationStepOptions) {
  return rehypeCitation.call(this, { ...options, bibliography: [...options.bibliography] });
}

/** Resolve bibliography paths from the vault, independent of the host process cwd. */
export const citations = (options: CitationOptions = {}) => {
  const files = options.bibliographyFile ?? "./bibliography.bib";
  const bibliographies: readonly string[] = Array.isArray(files) ? files : [files];
  const csl = options.csl ?? "apa";
  return definePlugin(() => ({
    id: "core:citations",
    options: {
      bibliographyFile: files,
      csl,
      suppressBibliography: options.suppressBibliography ?? false,
      linkCitations: options.linkCitations ?? false,
    },
    // rehype-citation reads these while it compiles: the bibliographies, and a style given as a `.csl` file.
    reads: /\.csl$/i.test(csl) ? [...bibliographies, csl] : bibliographies,
    transformGfm: {
      run(ctx) {
        const bibliography = bibliographies.map((file) => {
          const absolute = resolve(ctx.config.path, file);
          if (!existsSync(absolute)) throw new Error(`Citation bibliography not found: ${absolute}`);
          return relative(ctx.config.path, absolute);
        });
        getCompilerContributions(ctx).rehypePlugins.push([
          citationStep,
          {
            bibliography,
            path: ctx.config.path,
            csl,
            lang: "en-US",
            suppressBibliography: options.suppressBibliography ?? false,
            linkCitations: options.linkCitations ?? false,
          },
        ], markBibliographyLinks);
      },
      options: { fatal: true, enforce: "post" },
    },
  }))();
};

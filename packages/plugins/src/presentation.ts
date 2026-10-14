/** Optional presentation mode: a key plays the current note as slides, one per top-level `---` section. */
import { fileURLToPath } from "node:url";
import { definePlugin, getCompilerContributions } from "@svartz/core";
import type { Root } from "hast";

export interface PresentationOptions {
  /** The key that starts a presentation. Default `"p"`. */
  key?: string;
}

// Beside the bundle in dist, beside this file in src.
const STYLESHEET = fileURLToPath(new URL("./browser-presentation.css", import.meta.url));

/** Mark only top-level `<hr>`s as slide breaks; one inside a callout or quote stays part of its slide. */
function markSlideBreaks() {
  return (tree: Root) => {
    for (const node of tree.children) {
      if (node.type === "element" && node.tagName === "hr") node.properties.dataSvartzSlideBreak = "";
    }
  };
}

/**
 * Let readers present any note: `plugins: [presentation()]` in `svartz.config.ts`.
 * The browser script and stylesheet work with every theme.
 */
export const presentation = (options: PresentationOptions = {}) => definePlugin(() => ({
  id: "core:presentation",
  transformGfm: {
    run(ctx) {
      const compiler = getCompilerContributions(ctx);
      compiler.rehypePlugins.push(markSlideBreaks);
      compiler.browserResources.set("core:presentation", {
        id: "core:presentation",
        kind: "script",
        importId: "@svartz/plugins/browser-presentation",
        options: { key: options.key ?? "p" },
      });
      compiler.browserResources.set("core:presentation-css", {
        id: "core:presentation-css",
        kind: "css",
        importId: STYLESHEET,
      });
    },
    options: { fatal: true },
  },
}))();

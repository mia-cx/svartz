/** Optional Quartz-compatible soft-newline rendering. */
import { definePlugin, getCompilerContributions } from "@svartz/core";
import remarkBreaks from "remark-breaks";

/** Turn prose newlines into `<br>` only when this plugin is configured. */
export const hardLineBreaks = definePlugin(() => ({
  id: "core:hard-line-breaks",
  transformGfm: {
    run(ctx) {
      getCompilerContributions(ctx).remarkPlugins.push(remarkBreaks);
    },
    options: { fatal: true, enforce: "post" },
  },
}));

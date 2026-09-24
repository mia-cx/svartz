/**
 * core:transform-gfm — register GitHub Flavored Markdown compilation.
 *
 * GFM is an mdsvex/remark concern rather than a safe text rewrite. This stage
 * contributes remark-gfm to the compiler options consumed by emit-artifacts.
 */

import { definePlugin, getCompilerContributions } from "@svartz/core";
import remarkGfm, { type Options as GfmOptions } from "remark-gfm";

/** Register GFM parsing only while this plugin is active. */
export const transformGfm = (options?: GfmOptions) => definePlugin(() => ({
  id: "core:transform-gfm",

  transformGfm: {
    run(ctx) {
      getCompilerContributions(ctx).remarkPlugins.push(options ? [remarkGfm, options] : remarkGfm);
    },
    options: { fatal: true },
  },
}))();

export const TRANSFORM_GFM_ID = "core:transform-gfm" as const;

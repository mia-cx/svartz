/**
 * core:transform-gfm — register GitHub Flavored Markdown compilation.
 *
 * GFM is an mdsvex/remark concern rather than a safe text rewrite. This stage
 * contributes remark-gfm to the compiler options consumed by emit-artifacts.
 */

import { definePlugin } from "@svartz/core";
import remarkGfm from "remark-gfm";

export const MDSVEX_REMARK_PLUGINS_META_KEY = "svartz:mdsvex:remarkPlugins" as const;

export const transformGfm = definePlugin(() => ({
  id: "core:transform-gfm",

  transformGfm: {
    run(ctx) {
      const configured = ctx.meta.get(MDSVEX_REMARK_PLUGINS_META_KEY);
      const remarkPlugins = Array.isArray(configured) ? configured : [];

      if (!remarkPlugins.includes(remarkGfm)) {
        ctx.meta.set(MDSVEX_REMARK_PLUGINS_META_KEY, [...remarkPlugins, remarkGfm]);
      }
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_GFM_ID = "core:transform-gfm" as const;

/**
 * core:transform-ofm — Obsidian Flavored Markdown transforms.
 *
 * Handles callouts, embeds, highlights, and other OFM-specific syntax.
 * MVP: passes through unchanged. Transform logic will be added as OFM
 * features are implemented.
 */

import { definePlugin } from "@svartz/core";

export const transformOfm = definePlugin(() => ({
  id: "core:transform-ofm",

  transformOfm: {
    run(_ctx) {
      // MVP stub — OFM transforms implemented incrementally
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_OFM_ID = "core:transform-ofm" as const;

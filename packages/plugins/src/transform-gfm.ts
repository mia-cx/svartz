/**
 * core:transform-gfm — GitHub Flavored Markdown transforms.
 *
 * Handles tables, task lists, strikethrough, and other GFM features.
 * MVP: passes through unchanged.
 */

import { definePlugin } from "@svartz/core";

export const transformGfm = definePlugin(() => ({
  id: "core:transform-gfm",

  transformGfm: {
    run(_ctx) {
      // MVP stub — GFM transforms implemented incrementally
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_GFM_ID = "core:transform-gfm" as const;

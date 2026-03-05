/**
 * core:transform-toc — Table of Contents extraction.
 *
 * Extracts heading structure for TOC generation.
 * MVP: passes through unchanged.
 */

import { definePlugin } from "@svartz/core";

export const transformToc = definePlugin(() => ({
  id: "core:transform-toc",

  transformToc: {
    run(_ctx) {
      // MVP stub — TOC extraction implemented when heading tree type is defined
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_TOC_ID = "core:transform-toc" as const;

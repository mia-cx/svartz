/**
 * core:transform-syntax — Syntax highlighting transforms.
 *
 * Processes fenced code blocks for syntax highlighting.
 * MVP: passes through unchanged.
 */

import { definePlugin } from "@svartz/core";

export const transformSyntax = definePlugin(() => ({
  id: "core:transform-syntax",

  transformSyntax: {
    run(_ctx) {
      // MVP stub — syntax highlighting implemented when renderer integration is ready
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_SYNTAX_ID = "core:transform-syntax" as const;

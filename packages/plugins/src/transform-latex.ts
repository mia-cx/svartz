/**
 * core:transform-latex — LaTeX/math transforms.
 *
 * Processes $inline$ and $$block$$ math expressions.
 * MVP: passes through unchanged.
 */

import { definePlugin } from "@svartz/core";

export const transformLatex = definePlugin(() => ({
  id: "core:transform-latex",

  transformLatex: {
    run(_ctx) {
      // MVP stub — LaTeX transforms implemented when math rendering is ready
    },
    options: { fatal: true },
  },
}));

export const TRANSFORM_LATEX_ID = "core:transform-latex" as const;

/**
 * core:emit-artifacts — write build artifacts to disk.
 *
 * Emits the canonical index JSON artifact. Additional emitters (pages, assets)
 * are deferred to later MVP phases.
 *
 * Precondition: ctx.index is populated by core:index.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { definePlugin } from "@svartz/core";

export const emitArtifacts = definePlugin(() => ({
  id: "core:emit-artifacts",

  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;

      const outDir = ctx.vault.outDir;
      const indexPath = join(outDir, "index.json");

      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, JSON.stringify(ctx.index, null, 2), "utf-8");
    },
    options: { fatal: true, parallel: true },
  },
}));

export const EMIT_ARTIFACTS_ID = "core:emit-artifacts" as const;

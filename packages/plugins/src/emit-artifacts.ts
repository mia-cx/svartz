/**
 * core:emit-artifacts — write build artifacts to disk.
 *
 * Compiles note pages to `.svelte` modules and emits the eager runtime index
 * module consumed by the Vite runtime bridge.
 *
 * Precondition: ctx.index is populated by core:index.
 */

import { compile } from "mdsvex";
import { Effect } from "effect";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { definePlugin, type Artifact, type Index } from "@svartz/core";

function getArtifactsRoot(outDir: string): string {
  return resolve(outDir, "..", "artifacts");
}

function serializeValue(value: unknown): string {
  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeValue(entry)).join(", ")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entry]) => `${JSON.stringify(key)}: ${serializeValue(entry)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }

  return JSON.stringify(value);
}

async function compileNoteComponent(file: {
  readonly path: string;
  readonly slug: string;
  readonly content: string;
  readonly frontmatter?: Record<string, unknown>;
}): Promise<string> {
  const source = [
    "<script context=\"module\" lang=\"ts\">",
    `export const svartz = ${serializeValue({
      slug: file.slug,
      path: file.path,
      frontmatter: file.frontmatter ?? {},
    })};`,
    "</script>",
    "",
    file.content,
  ].join("\n");

  const result = await compile(source, { extension: ".svx" });
  return result?.code ?? source;
}

function buildIndexModuleSource(index: Index): string {
  return [
    `export const index = ${serializeValue(index)};`,
    "export const graph = index.graph;",
    "export const backlinks = index.backlinks;",
    "export const search = index.entries;",
  ].join("\n");
}

export const emitArtifacts = definePlugin(() => ({
  id: "core:emit-artifacts",

  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;

      const artifactsRoot = getArtifactsRoot(ctx.config.outDir);
      const pageArtifacts = await Promise.all(
        ctx.files.map(async (file) => {
          const key = `pages/${file.slug}.svelte`;
          const path = join(artifactsRoot, key);
          const contents = await compileNoteComponent(file);

          const artifact: Artifact = {
            key,
            path,
            type: "svelte",
            pluginId: "core:emit-artifacts",
            noteSlug: file.slug,
            contents,
          };

          return artifact;
        }),
      );

      for (const artifact of pageArtifacts) {
        ctx.artifacts.set(artifact.key, artifact);
      }

      const indexKey = "index.ts";
      ctx.artifacts.set(indexKey, {
        key: indexKey,
        path: join(artifactsRoot, indexKey),
        type: "ts",
        pluginId: "core:emit-artifacts",
        contents: buildIndexModuleSource(ctx.index),
      });

      await rm(artifactsRoot, { recursive: true, force: true });

      const sortedArtifacts = [...ctx.artifacts.values()].sort((left, right) =>
        left.key.localeCompare(right.key),
      );

      await Effect.runPromise(
        Effect.forEach(
          sortedArtifacts,
          (artifact) =>
            Effect.promise(async () => {
              await mkdir(dirname(artifact.path), { recursive: true });
              await writeFile(artifact.path, artifact.contents);
            }),
          { concurrency: "unbounded" },
        ),
      );
    },
    options: { fatal: true, enforce: "post" },
  },
}));

export const EMIT_ARTIFACTS_ID = "core:emit-artifacts" as const;

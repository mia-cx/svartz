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
import MiniSearch from "minisearch";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { definePlugin, type Artifact, type Index } from "@svartz/core";

type MdsvexOptions = NonNullable<Parameters<typeof compile>[1]>;

const REMARK_PLUGINS = [remarkGfm, remarkMath] as MdsvexOptions["remarkPlugins"];
const REHYPE_PLUGINS = [
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "append",
      properties: {
        ariaHidden: true,
        tabIndex: -1,
        className: ["heading-anchor"],
      },
    },
  ] as unknown,
  rehypeKatex,
  [
    rehypePrettyCode,
    {
      theme: "github-dark-default",
      keepBackground: false,
    },
  ] as unknown,
] as MdsvexOptions["rehypePlugins"];

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

  const result = await compile(source, {
    extension: ".svx",
    remarkPlugins: REMARK_PLUGINS,
    rehypePlugins: REHYPE_PLUGINS,
  });
  return result?.code ?? source;
}

function buildSearchModuleSource(index: Index): string {
  const searchDocuments = Array.isArray(index.search) ? index.search : [];
  const miniSearch = new MiniSearch({
    fields: ["title", "description", "content", "tags", "aliases"],
    storeFields: ["slug", "title", "description", "tags"],
    idField: "id",
  });

  miniSearch.addAll(searchDocuments);

  return [
    `export const searchDocuments = ${serializeValue(searchDocuments)};`,
    `export const searchIndex = ${JSON.stringify(miniSearch.toJSON())};`,
  ].join("\n");
}

function buildIndexModuleSource(index: Index): string {
  return [
    `export const index = ${serializeValue(index)};`,
    "export const graph = index.graph;",
    "export const backlinks = index.backlinks;",
    "export const search = index.search;",
    "export const tags = index.tags;",
    "export const folders = index.folders;",
    "export const routes = index.routes;",
    "export const assets = index.assets;",
  ].join("\n");
}

export const emitArtifacts = definePlugin(() => ({
  id: "core:emit-artifacts",

  emitArtifacts: {
    async run(ctx) {
      if (!ctx.index) return;

      const artifactsRoot = getArtifactsRoot(ctx.config.outDir);
      const noteFiles = ctx.files.filter((file) =>
        file.extension && [".md", ".mdx", ".svx"].includes(file.extension),
      );
      const assetFiles = ctx.files.filter(
        (file) => !file.extension || ![".md", ".mdx", ".svx"].includes(file.extension),
      );
      const pageArtifacts = await Promise.all(
        noteFiles.map(async (file) => {
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
      const assetArtifacts = await Promise.all(
        assetFiles
          .filter((file) => file.sourcePath)
          .map(async (file) => {
            const key = `assets/${file.path}`;
            const path = join(artifactsRoot, key);
            const contents = await readFile(file.sourcePath!);

            const artifact: Artifact = {
              key,
              path,
              type: "asset",
              pluginId: "core:emit-artifacts",
              contents,
            };

            return artifact;
          }),
      );

      for (const artifact of pageArtifacts) {
        ctx.artifacts.set(artifact.key, artifact);
      }
      for (const artifact of assetArtifacts) {
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
      ctx.artifacts.set("search.ts", {
        key: "search.ts",
        path: join(artifactsRoot, "search.ts"),
        type: "ts",
        pluginId: "core:emit-artifacts",
        contents: buildSearchModuleSource(ctx.index),
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

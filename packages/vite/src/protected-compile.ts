/** Compile one password group's note graph without writing plaintext artifacts. */
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { compileProtectedNoteSource } from "@svartz/plugins";
import { build, type Plugin } from "vite";

const RESOLVED_ENTRY_ID = "\0svartz-protected-entry";
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

export interface ProtectedGraph {
  readonly js: string;
  readonly css: string;
  readonly modules: readonly string[];
  readonly notes: readonly { slug: string; exportName: string }[];
}

function assertClientModule(id: string): void {
  const normalized = id.replaceAll("\\", "/").split("?", 1)[0]!;
  if (
    NODE_BUILTINS.has(normalized) ||
    normalized === "$app/server" ||
    normalized.startsWith("$env/static/private") ||
    normalized.startsWith("$env/dynamic/private") ||
    normalized === "$lib/server" ||
    normalized.startsWith("$lib/server/") ||
    /(?:^|\/)server(?:\/|$)/.test(normalized) ||
    /\.server(?:\.[^/]*)?$/.test(normalized)
  ) {
    throw new Error(`Protected note imports a server-only module: ${id}`);
  }
}

function protectedSourcePlugin(ctx: PluginContext, group: string, files: readonly ProcessedFile[], entryId: string): Plugin {
  const bySource = new Map(ctx.files
    .filter((file) => file.sourcePath && [".md", ".mdx", ".svx"].includes(file.extension ?? ""))
    .map((file) => [resolve(file.sourcePath!), file] as const));

  return {
    name: "svartz:protected-source",
    enforce: "pre",
    resolveId(id) {
      assertClientModule(id);
      if (id === entryId) return RESOLVED_ENTRY_ID;
    },
    async load(id) {
      if (id === RESOLVED_ENTRY_ID) {
        return files.map((file, index) =>
          `export { default as note${index} } from ${JSON.stringify(resolve(file.sourcePath!))};`,
        ).join("\n");
      }
      assertClientModule(id);
      const path = id.split("?", 1)[0]!;
      const file = bySource.get(resolve(path));
      if (!file) {
        if (/\.(?:md|mdx|svx)$/i.test(path)) {
          throw new Error(`Protected group "${group}" cannot import unpublished note "${path}"`);
        }
        return;
      }
      if (file.protection?.group !== group) {
        throw new Error(`Protected group "${group}" cannot import note "${file.path}"`);
      }
      return compileProtectedNoteSource(ctx, file);
    },
  };
}

/** Return a single self-contained JS module and its CSS for later encryption. */
export async function compileProtectedGraph(ctx: PluginContext, group: string, root: string): Promise<ProtectedGraph> {
  const files = ctx.files.filter((file) => file.protection?.group === group)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (files.length === 0) throw new Error(`Password group "${group}" has no published notes`);
  for (const file of files) {
    if (!file.sourcePath) throw new Error(`Protected note "${file.path}" has no source path`);
  }
  const entryId = resolve(root, ".svartz-protected-entry.js");

  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [
      protectedSourcePlugin(ctx, group, files, entryId),
      svelte({ configFile: false, extensions: [".svelte", ".svx"], preprocess: vitePreprocess() }),
    ],
    build: {
      write: false,
      copyPublicDir: false,
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      lib: { entry: entryId, formats: ["es"], fileName: "protected" },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const output = bundles.flatMap((bundle) => "output" in bundle ? bundle.output : []);
  const chunks = output.filter((item) => item.type === "chunk");
  if (chunks.length !== 1 || chunks[0]!.imports.length || chunks[0]!.dynamicImports.length) {
    throw new Error(`Protected group "${group}" did not compile to one self-contained module`);
  }
  const unexpectedAssets = output.filter((item) => item.type === "asset" && !item.fileName.endsWith(".css"));
  if (unexpectedAssets.length > 0) {
    throw new Error(`Protected group "${group}" emitted unclassified assets`);
  }
  const modules = Object.keys(chunks[0]!.modules).sort();
  for (const id of modules) assertClientModule(id);
  return {
    js: chunks[0]!.code,
    css: output.filter((item) => item.type === "asset").map((item) => String(item.source)).join("\n"),
    modules,
    notes: files.map((file, index) => ({ slug: file.slug, exportName: `note${index}` })),
  };
}

/** Compile one password group's note graph without writing plaintext artifacts. */
import { realpath } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { resolve } from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { compileProtectedNoteSource } from "@svartz/plugins";
import { build, type Plugin } from "vite";

const RESOLVED_ENTRY_ID = "\0svartz-protected-entry";
const BRIDGE_PREFIX = "svartz:bridge/";
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const CLIENT_APP_MODULES = new Set([
  "$app/environment", "$app/forms", "$app/navigation", "$app/paths", "$app/state", "$app/stores",
  "$env/static/public", "$env/dynamic/public",
]);

export interface ProtectedGraph {
  readonly js: string;
  readonly css: string;
  readonly modules: readonly string[];
  readonly notes: readonly { slug: string; exportName: string }[];
  readonly bridgeImports: readonly string[];
}

async function assertSharedSvelteInstallation(root: string): Promise<void> {
  const hostRequire = createRequire(resolve(root, "package.json"));
  const compilerRequire = createRequire(import.meta.url);
  const [host, compiler] = await Promise.all([
    realpath(hostRequire.resolve("svelte/package.json")),
    realpath(compilerRequire.resolve("svelte/package.json")),
  ]);
  if (host !== compiler) {
    throw new Error("Protected notes must compile against the host app's Svelte installation");
  }
}

function sharedRuntimeImport(id: string): boolean {
  if (CLIENT_APP_MODULES.has(id)) return true;
  if (id === "$lib" || id.startsWith("$lib/")) return true;
  return (id === "svelte" || id.startsWith("svelte/")) &&
    id !== "svelte/compiler" && id !== "svelte/server" && !id.startsWith("svelte/internal/server");
}

function bridgeId(id: string): string {
  return `${BRIDGE_PREFIX}${encodeURIComponent(id)}`;
}

function assertClientModule(id: string): void {
  const normalized = id.replaceAll("\\", "/").split("?", 1)[0]!;
  if (
    NODE_BUILTINS.has(normalized) ||
    normalized === "$app/server" ||
    normalized.startsWith("$env/static/private") ||
    normalized.startsWith("$env/dynamic/private") ||
    normalized === "svelte/compiler" ||
    normalized === "svelte/server" ||
    normalized.startsWith("svelte/internal/server") ||
    normalized.startsWith("$app/") && !CLIENT_APP_MODULES.has(normalized) ||
    normalized.startsWith("$env/") && !CLIENT_APP_MODULES.has(normalized) ||
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
      if (sharedRuntimeImport(id)) return { id: bridgeId(id), external: true };
    },
    async load(id) {
      if (id === RESOLVED_ENTRY_ID) {
        return files.map((file, index) =>
          `export { default as note${index} } from ${JSON.stringify(resolve(file.sourcePath!))};`,
        ).join("\n");
      }
      assertClientModule(id);
      const [path, query] = id.split("?", 2);
      if (!path) return;
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
      if (query) {
        const request = new URLSearchParams(query);
        if (request.has("svelte") && request.get("type") === "style") return;
        throw new Error(`Protected group "${group}" cannot import note "${file.path}" with a query`);
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
  await assertSharedSvelteInstallation(root);
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
  if (chunks.length !== 1 || chunks[0]!.dynamicImports.length ||
    chunks[0]!.imports.some((id) => !id.startsWith(BRIDGE_PREFIX))) {
    throw new Error(`Protected group "${group}" has an unclassified module import`);
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
    bridgeImports: chunks[0]!.imports.map((id) => decodeURIComponent(id.slice(BRIDGE_PREFIX.length))),
  };
}

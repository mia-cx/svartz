import { join, resolve } from "node:path";
import type { Artifact, ResolvedConfig } from "@svartz/core";

const GENERATED_ARTIFACTS_DIRNAME = "artifacts" as const;
const GENERATED_PAGES_DIRNAME = "pages" as const;
const GENERATED_INDEX_BASENAME = "index.ts" as const;
const GENERATED_SEARCH_BASENAME = "search.ts" as const;
const GENERATED_RUNTIME_THEME_BASENAME = "runtime-theme.ts" as const;
const GENERATED_RUNTIME_ARTIFACTS_BASENAME = "runtime-artifacts.ts" as const;

function getVaultBuildRoot(config: ResolvedConfig): string {
  return resolve(config.outDir, "..");
}

function getGeneratedArtifactsRoot(config: ResolvedConfig): string {
  return join(getVaultBuildRoot(config), GENERATED_ARTIFACTS_DIRNAME);
}

function getGeneratedPagesRoot(config: ResolvedConfig): string {
  return join(getGeneratedArtifactsRoot(config), GENERATED_PAGES_DIRNAME);
}

function getGeneratedIndexModulePath(config: ResolvedConfig): string {
  return join(getGeneratedArtifactsRoot(config), GENERATED_INDEX_BASENAME);
}

function getGeneratedSearchModulePath(config: ResolvedConfig): string {
  return join(getGeneratedArtifactsRoot(config), GENERATED_SEARCH_BASENAME);
}

function getGeneratedRuntimeThemeModulePath(config: ResolvedConfig): string {
  return join(getGeneratedArtifactsRoot(config), GENERATED_RUNTIME_THEME_BASENAME);
}

function getGeneratedRuntimeArtifactsModulePath(config: ResolvedConfig): string {
  return join(getGeneratedArtifactsRoot(config), GENERATED_RUNTIME_ARTIFACTS_BASENAME);
}

function getGeneratedPageModulePath(
  config: ResolvedConfig,
  relativePagePath: string,
): string {
  return join(getGeneratedPagesRoot(config), relativePagePath);
}

function createArtifactsVirtualModuleSource(
  artifacts: readonly Artifact[],
  indexModulePath: string,
  searchModulePath: string,
  themeConfig: Record<string, unknown> = {},
): string {
  const records = artifacts.map((artifact) => ({
    key: artifact.key,
    path: artifact.path,
    type: artifact.type,
    noteSlug: artifact.noteSlug,
  }));

  const svelteArtifacts = artifacts.filter((artifact) => artifact.type === "svelte");
  const noteImports = svelteArtifacts
    .map(
      (artifact, index) =>
        `import * as noteArtifact${index} from ${JSON.stringify(artifact.path)};`,
    )
    .join("\n");
  const noteModules = svelteArtifacts
    .map(
      (artifact, index) =>
        `  ${JSON.stringify(artifact.key)}: noteArtifact${index},`,
    )
    .join("\n");

  return [
    `import { index, graph, backlinks, search, tags, folders, routes, assets } from ${JSON.stringify(indexModulePath)};`,
    `import { searchDocuments, searchIndex } from ${JSON.stringify(searchModulePath)};`,
    noteImports,
    "",
    `export const artifacts = new Map(${JSON.stringify(records)}.map((record) => [record.key, record]));`,
    "",
    "const noteArtifactModules = {",
    noteModules,
    "};",
    "",
    "export function hasNoteArtifact(key) {",
    "  return Object.hasOwn(noteArtifactModules, key);",
    "}",
    "",
    "export function getNoteArtifact(key) {",
    "  const artifact = noteArtifactModules[key];",
    "  if (!artifact) {",
    '    throw new Error(`[svartz:vite] note artifact "${key}" is not available`);',
    "  }",
    "  return artifact;",
    "}",
    "",
    `export const themeConfig = ${JSON.stringify(themeConfig)};`,
    "",
    "export { index, graph, backlinks, search, tags, folders, routes, assets, searchDocuments, searchIndex };",
  ].join("\n");
}

export {
  createArtifactsVirtualModuleSource,
  GENERATED_ARTIFACTS_DIRNAME,
  GENERATED_INDEX_BASENAME,
  GENERATED_PAGES_DIRNAME,
  GENERATED_RUNTIME_ARTIFACTS_BASENAME,
  GENERATED_RUNTIME_THEME_BASENAME,
  GENERATED_SEARCH_BASENAME,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getGeneratedRuntimeArtifactsModulePath,
  getGeneratedRuntimeThemeModulePath,
  getGeneratedSearchModulePath,
  getVaultBuildRoot,
};

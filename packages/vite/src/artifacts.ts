import { join, resolve } from "node:path";
import type { Artifact, ResolvedConfig } from "@svartz/core";

const GENERATED_ARTIFACTS_DIRNAME = "artifacts" as const;
const GENERATED_PAGES_DIRNAME = "pages" as const;
const GENERATED_INDEX_BASENAME = "index.ts" as const;

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

function getGeneratedPageModulePath(
  config: ResolvedConfig,
  relativePagePath: string,
): string {
  return join(getGeneratedPagesRoot(config), relativePagePath);
}

function createArtifactsVirtualModuleSource(
  artifacts: readonly Artifact[],
  indexModulePath: string,
): string {
  const records = artifacts.map((artifact) => ({
    key: artifact.key,
    path: artifact.path,
    type: artifact.type,
    noteSlug: artifact.noteSlug,
  }));

  const loaders = artifacts
    .filter((artifact) => artifact.type === "svelte")
    .map(
      (artifact) =>
        `  ${JSON.stringify(artifact.key)}: () => import(${JSON.stringify(artifact.path)}),`,
    )
    .join("\n");

  return [
    `import { index, graph, backlinks, search } from ${JSON.stringify(indexModulePath)};`,
    "",
    `export const artifacts = new Map(${JSON.stringify(records)}.map((record) => [record.key, record]));`,
    "",
    "const noteArtifactLoaders = {",
    loaders,
    "};",
    "",
    "export async function loadNoteArtifact(key) {",
    "  const loader = noteArtifactLoaders[key];",
    "  if (!loader) {",
    '    throw new Error(`[svartz:vite] note artifact "${key}" is not available`);',
    "  }",
    "  return loader();",
    "}",
    "",
    "export { index, graph, backlinks, search };",
  ].join("\n");
}

export {
  createArtifactsVirtualModuleSource,
  GENERATED_ARTIFACTS_DIRNAME,
  GENERATED_INDEX_BASENAME,
  GENERATED_PAGES_DIRNAME,
  getGeneratedArtifactsRoot,
  getGeneratedIndexModulePath,
  getGeneratedPageModulePath,
  getGeneratedPagesRoot,
  getVaultBuildRoot,
};

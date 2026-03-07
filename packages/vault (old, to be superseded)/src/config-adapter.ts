import type {
  ResolvedBuildDefaults,
  ResolvedVaultConfig,
} from "@svartz/config";
import type { BuildIndexOptions, TraverseVaultOptions } from "./types.js";

export interface ResolvedVaultAdapterOutput {
  readonly vaultPath: string;
  readonly traverseOptions: TraverseVaultOptions;
  readonly buildOptions: BuildIndexOptions;
}

export const mapResolvedVaultToIndexOptions = (
  vault: ResolvedVaultConfig,
  buildDefaults: ResolvedBuildDefaults,
): ResolvedVaultAdapterOutput => ({
  vaultPath: vault.path,
  traverseOptions: {
    include: [...vault.include],
    exclude: [...vault.exclude],
  },
  buildOptions: {
    titleField: vault.frontmatter.titleField,
    descriptionField: vault.frontmatter.descriptionField,
    tagsField: vault.frontmatter.tagsField,
    aliasesField: vault.frontmatter.aliasesField,
    createdAtField: vault.frontmatter.createdAtField,
    updatedAtField: vault.frontmatter.updatedAtField,
    publishedField: vault.frontmatter.publishedField,
    dateFormat: vault.frontmatter.dateFormat,
    linkResolution: vault.linkResolution,
    concurrency: buildDefaults.concurrency,
    maxRetries: buildDefaults.maxRetries,
    vaultPath: vault.path,
    include: [...vault.include],
    exclude: [...vault.exclude],
  },
});

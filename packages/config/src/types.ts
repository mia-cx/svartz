import { Data } from "effect";
import type { Schema } from "effect";
import type {
  SvartzConfigSchema,
  VaultConfigSchema,
  SvartzDefaultsSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  LinkResolutionStrategySchema,
  FrontmatterFieldsSchema,
  TailwindThemeConfigSchema,
} from "./schema.js";

// --- Inferred types from Schema ---

export type SvartzConfig = Schema.Schema.Type<typeof SvartzConfigSchema>;
export type VaultConfig = Schema.Schema.Type<typeof VaultConfigSchema>;
export type SvartzDefaults = Schema.Schema.Type<typeof SvartzDefaultsSchema>;
export type VaultThemeConfig = Schema.Schema.Type<typeof VaultThemeConfigSchema>;
export type TargetConfig = Schema.Schema.Type<typeof TargetConfigSchema>;
export type LinkResolutionStrategy = Schema.Schema.Type<typeof LinkResolutionStrategySchema>;
export type FrontmatterFields = Schema.Schema.Type<typeof FrontmatterFieldsSchema>;
export type TailwindThemeConfig = Schema.Schema.Type<typeof TailwindThemeConfigSchema>;

// --- Resolved output interfaces ---

export interface ResolvedFrontmatter {
  readonly titleField: string;
  readonly descriptionField: string;
  readonly tagsField: string;
  readonly aliasesField: string;
  readonly createdAtField: string;
  readonly updatedAtField: string;
  readonly publishedField: string;
  readonly dateFormat?: string;
}

export interface ResolvedTheme {
  readonly base: string;
  readonly config: Record<string, unknown>;
}

export interface ResolvedVaultConfig {
  readonly id: string;
  readonly path: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly linkResolution: LinkResolutionStrategy;
  readonly theme: ResolvedTheme;
  readonly frontmatter: ResolvedFrontmatter;
  readonly rootPath: string;
  readonly target: TargetConfig;
}

export interface ResolvedBuildDefaults {
  readonly concurrency: number;
  readonly maxRetries: number;
}

export interface ResolvedSvartzConfig {
  readonly workspace: { readonly rootDir: string };
  readonly defaults: {
    readonly vault: {
      readonly include: readonly string[];
      readonly exclude: readonly string[];
      readonly linkResolution: LinkResolutionStrategy;
      readonly theme: ResolvedTheme;
      readonly frontmatter: ResolvedFrontmatter;
    };
    readonly build: ResolvedBuildDefaults;
  };
  readonly vaults: readonly ResolvedVaultConfig[];
}

export interface VaultSummary {
  readonly id: string;
  readonly path: string;
  readonly themeBase: string;
  readonly target: TargetConfig;
}

// --- Tagged errors ---

export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly searchPath: string;
  readonly message: string;
}> {}

export class ConfigImportFailed extends Data.TaggedError("ConfigImportFailed")<{
  readonly path: string;
  readonly message: string;
}> {}

export class ConfigDecodeFailed extends Data.TaggedError("ConfigDecodeFailed")<{
  readonly issues: ReadonlyArray<unknown>;
  readonly message: string;
}> {}

export class VaultPathInvalid extends Data.TaggedError("VaultPathInvalid")<{
  readonly vaultId: string;
  readonly path: string;
  readonly message: string;
}> {}

export class VaultIdNotFound extends Data.TaggedError("VaultIdNotFound")<{
  readonly vaultId: string;
  readonly message: string;
}> {}

export type ConfigError =
  | ConfigNotFound
  | ConfigImportFailed
  | ConfigDecodeFailed
  | VaultPathInvalid
  | VaultIdNotFound;

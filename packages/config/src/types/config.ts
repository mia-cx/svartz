import type { Schema } from "effect";
import type {
  SvartzConfigSchema,
  VaultConfigSchema,
  VaultOptionsSchema,
  SvartzDefaultsSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  LinkResolutionStrategySchema,
  FrontmatterFieldsSchema,
  SiteConfigSchema,
} from "../schemas";

// --- Inferred types from Schema ---

type SvartzConfig = Schema.Schema.Type<typeof SvartzConfigSchema>;
type VaultConfig = Schema.Schema.Type<typeof VaultConfigSchema>;
type VaultOptions = Schema.Schema.Type<typeof VaultOptionsSchema>;
type SvartzDefaults = Schema.Schema.Type<typeof SvartzDefaultsSchema>;
type VaultThemeConfig = Schema.Schema.Type<
  typeof VaultThemeConfigSchema
>;
type TargetConfig = Schema.Schema.Type<typeof TargetConfigSchema>;
type LinkResolutionStrategy = Schema.Schema.Type<
  typeof LinkResolutionStrategySchema
>;
type FrontmatterFields = Schema.Schema.Type<
  typeof FrontmatterFieldsSchema
>;
type SiteConfig = Schema.Schema.Type<typeof SiteConfigSchema>;

export {
  type SvartzConfig,
  type VaultConfig,
  type VaultOptions,
  type SvartzDefaults,
  type VaultThemeConfig,
  type TargetConfig,
  type LinkResolutionStrategy,
  type FrontmatterFields,
  type SiteConfig,
};

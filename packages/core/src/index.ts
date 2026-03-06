// Shared types
export type {
  Artifact,
  ArtifactBag,
  MaybePromise,
  LinkResolutionStrategy,
  TargetConfig,
  ResolvedConfig,
  ResolvedFrontmatterConfig,
  ResolvedThemeConfig,
  ResolvedBuildConfig,
  ResolvedVaultDefaults,
  ProcessedFile,
  ChangeEvent,
  IndexLink,
  IndexEntry,
  Index,
  RawLink,
  GraphTarget,
  Graph,
} from "./types";

// Plugin contract — types
export type {
  PluginContext,
  HookOptions,
  PluginHook,
  PluginChangeHook,
  PluginHookInput,
  PluginChangeHookInput,
  SvartzPlugin,
  NormalizedSvartzPlugin,
  StageName,
} from "./plugin/types";
export { STAGE_NAMES } from "./plugin/types";

// Plugin contract — utilities
export { definePlugin, type PluginFactory } from "./plugin/define-plugin";
export { mergePlugins } from "./plugin/merge";
export {
  normalizePlugin,
  isPluginEnabled,
  sortPluginsForStage,
} from "./plugin/utils";
export {
  HOOK_PARALLEL_DEFAULTS,
  executeHandleChange,
  executeStage,
  runLifecycleHooks,
  runStages,
} from "./plugin/runner";
export type {
  HookExecutionResult,
  RunnerPlugin,
  RunnerResult,
} from "./plugin/runner";
export {
  PluginAggregateError,
  PluginValidationError,
  PluginHookError,
  type PluginError,
} from "./plugin/errors";

// Plugin contract — Effect Schema (internal validation schemas)
export {
  PluginSchema,
  HookInputSchema,
  HookOptionsSchema,
  HookObjectSchema,
  FnSchema,
  validatePluginShape,
  KNOWN_PLUGIN_KEYS,
} from "./plugin/schema";

// Theme contract — types
export type {
  ThemeComponentLoader,
  ThemeLayoutMap,
  ThemeRouteDefinition,
  ThemeComponentRegistry,
  ThemeArtifactRequirements,
  ThemeRenderCapabilities,
  ThemePluginPreset,
  SvartzTheme,
} from "./theme/types";
export { CONTRACT_VERSION } from "./theme/types";
export {
  matchThemeRoute,
  normalizePathname,
  resolveThemeRouteToArtifactKey,
} from "./theme/route-matcher";
export type {
  RuntimeRouteInput,
  RuntimeRouteMatch,
} from "./theme/route-matcher";

// Theme contract — utilities
export { defineTheme, validateTheme, type ThemeFactory } from "./theme/define-theme";
export { ThemeValidationError, type ThemeError } from "./theme/errors";

// Tailwind — schema + types
export {
  TailwindThemeConfigPropertyRecordSchema,
  TailwindThemeConfigSchema,
} from "./tailwind/schema";
export type {
  TailwindThemeConfig,
  DefaultThemeOverrideHints,
} from "./tailwind/types";

// Wrangler — schema + types
export {
  CustomDomainRouteSchema,
  ZoneIdRouteSchema,
  ZoneNameRouteSchema,
  WranglerRouteSchema,
  WranglerAssetsSchema,
  WranglerBuildSchema,
  WranglerLimitsSchema,
  WranglerObservabilitySchema,
  WranglerPlacementSchema,
  WranglerTriggersSchema,
  WranglerConfigFieldsSchema,
  WranglerEnvRecordSchema,
  WranglerConfigSchema,
} from "./wrangler/schema";
export type {
  CustomDomainRoute,
  WranglerAssets,
  WranglerBuild,
  WranglerConfig,
  WranglerConfigFields,
  WranglerEnvRecord,
  WranglerLimits,
  WranglerObservability,
  WranglerPlacement,
  WranglerRoute,
  WranglerTriggers,
  ZoneIdRoute,
  ZoneNameRoute,
} from "./wrangler/types";

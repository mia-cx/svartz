// Shared types
export type {
  MaybePromise,
  LinkResolutionStrategy,
  TargetConfig,
  ResolvedFrontmatterConfig,
  ResolvedThemeConfig,
  ResolvedBuildConfig,
  ResolvedVaultDefaults,
  ResolvedVaultConfig,
  ResolvedSvartzConfig,
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
  PluginValidationError,
  PluginHookError,
  type PluginError,
} from "./plugin/errors";

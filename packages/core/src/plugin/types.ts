import type {
  MaybePromise,
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  ProcessedFile,
  ChangeEvent,
  Index,
} from "../types";

// --- Hook options ---

type HookOptions = {
  fatal?: boolean;
  enforce?: "pre" | "post";
  parallel?: boolean;
};

// --- Hook types (object form) ---

type PluginHook = {
  run: (ctx: PluginContext) => MaybePromise<void>;
  options?: HookOptions;
};

type PluginChangeHook = {
  run: (event: ChangeEvent, ctx: PluginContext) => MaybePromise<void>;
  options?: HookOptions;
};

// --- Hook input types (shorthand | object) ---

type PluginHookInput =
  | ((ctx: PluginContext) => MaybePromise<void>)
  | PluginHook;

type PluginChangeHookInput =
  | ((event: ChangeEvent, ctx: PluginContext) => MaybePromise<void>)
  | PluginChangeHook;

// --- Plugin context ---

interface PluginContext {
  readonly config: ResolvedSvartzConfig;
  readonly vault: ResolvedVaultConfig;
  files: ProcessedFile[];
  index?: Index;
  meta: Map<string, unknown>;
}

// --- Pipeline stage names (canonical execution order) ---

const STAGE_NAMES = [
  "buildStart",
  "configResolved",
  "discoverFiles",
  "parseFrontmatter",
  "filterUnpublished",
  "resolveLinks",
  "transformOfm",
  "transformGfm",
  "transformToc",
  "transformDescription",
  "transformSyntax",
  "transformLatex",
  "indexContent",
  "emitArtifacts",
  "buildEnd",
] as const;

type StageName = (typeof STAGE_NAMES)[number];

// --- Plugin interface (author-facing) ---

interface SvartzPlugin {
  readonly id: string;
  readonly contractVersion?: string;
  readonly disabled?: boolean;

  // Lifecycle hooks
  buildStart?: PluginHookInput;
  configResolved?: PluginHookInput;
  buildEnd?: PluginHookInput;
  handleChange?: PluginChangeHookInput;

  // Pipeline hooks (plugin-specific, in execution order)
  discoverFiles?: PluginHookInput;
  parseFrontmatter?: PluginHookInput;
  filterUnpublished?: PluginHookInput;
  resolveLinks?: PluginHookInput;
  transformOfm?: PluginHookInput;
  transformGfm?: PluginHookInput;
  transformToc?: PluginHookInput;
  transformDescription?: PluginHookInput;
  transformSyntax?: PluginHookInput;
  transformLatex?: PluginHookInput;
  indexContent?: PluginHookInput;
  emitArtifacts?: PluginHookInput;
}

// --- Normalized plugin (runner-facing, all hooks in object form) ---

interface NormalizedSvartzPlugin {
  readonly id: string;
  readonly contractVersion?: string;
  readonly disabled?: boolean;

  // Lifecycle hooks
  buildStart?: PluginHook;
  configResolved?: PluginHook;
  buildEnd?: PluginHook;
  handleChange?: PluginChangeHook;

  // Pipeline hooks
  discoverFiles?: PluginHook;
  parseFrontmatter?: PluginHook;
  filterUnpublished?: PluginHook;
  resolveLinks?: PluginHook;
  transformOfm?: PluginHook;
  transformGfm?: PluginHook;
  transformToc?: PluginHook;
  transformDescription?: PluginHook;
  transformSyntax?: PluginHook;
  transformLatex?: PluginHook;
  indexContent?: PluginHook;
  emitArtifacts?: PluginHook;
}

export type {
  HookOptions,
  PluginHook,
  PluginChangeHook,
  PluginHookInput,
  PluginChangeHookInput,
  PluginContext,
  SvartzPlugin,
  NormalizedSvartzPlugin,
  StageName,
};

export { STAGE_NAMES };

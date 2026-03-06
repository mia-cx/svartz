class PluginValidationError extends Error {
  readonly _tag = "PluginValidationError" as const;
  readonly pluginId: string;

  constructor(opts: { pluginId: string; message: string }) {
    super(opts.message);
    this.name = "PluginValidationError";
    this.pluginId = opts.pluginId;
  }
}

class PluginHookError extends Error {
  readonly _tag = "PluginHookError" as const;
  readonly pluginId: string;
  readonly stage: string;
  readonly fatal: boolean;
  override readonly cause?: unknown;

  constructor(opts: {
    pluginId: string;
    stage: string;
    message: string;
    cause?: unknown;
    fatal: boolean;
  }) {
    super(opts.message);
    this.name = "PluginHookError";
    this.pluginId = opts.pluginId;
    this.stage = opts.stage;
    this.fatal = opts.fatal;
    this.cause = opts.cause;
  }
}

class PluginAggregateError extends Error {
  readonly _tag = "PluginAggregateError" as const;
  readonly errors: readonly PluginHookError[];

  constructor(opts: { message: string; errors: readonly PluginHookError[] }) {
    super(opts.message);
    this.name = "PluginAggregateError";
    this.errors = opts.errors;
  }
}

type PluginError =
  | PluginAggregateError
  | PluginHookError
  | PluginValidationError;

export {
  PluginAggregateError,
  PluginValidationError,
  PluginHookError,
  type PluginError,
};

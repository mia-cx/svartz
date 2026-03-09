import {
  PluginAggregateError,
  PluginHookError,
} from "./errors";
import type {
  NormalizedSvartzPlugin,
  PluginChangeHook,
  PluginContext,
  PluginHook,
  StageName,
  SvartzPlugin,
} from "./types";
import { STAGE_NAMES } from "./types";
import { normalizePlugin, sortPluginsForStage } from "./utils";
import type { ChangeEvent } from "../types";

type RunnerPlugin = NormalizedSvartzPlugin | SvartzPlugin;
type RunnerHookName = StageName | "handleChange";

interface HookExecutionResult {
  readonly errors: readonly PluginHookError[];
  readonly fatalError?: PluginHookError;
}

interface RunnerResult {
  readonly errors: readonly PluginHookError[];
}

const HOOK_PARALLEL_DEFAULTS: Record<RunnerHookName, boolean> = {
  buildStart: false,
  configResolved: false,
  buildEnd: false,
  handleChange: false,
  discoverFiles: false,
  parseFrontmatter: false,
  filterUnpublished: false,
  resolveLinks: false,
  transformOfm: true,
  transformGfm: true,
  transformToc: true,
  transformDescription: true,
  transformSyntax: true,
  transformLatex: true,
  transformEmbeds: true,
  indexContent: false,
  emitArtifacts: false,
};

function normalizeRunnerPlugins(
  plugins: readonly RunnerPlugin[],
): NormalizedSvartzPlugin[] {
  return plugins.map((plugin) => normalizePlugin(plugin as SvartzPlugin));
}

function getHookParallelValue(
  hookName: RunnerHookName,
  hook: PluginHook | PluginChangeHook,
): boolean {
  if (hook.options?.parallel !== undefined) {
    return hook.options.parallel;
  }

  if (hook.options?.enforce === "pre" || hook.options?.enforce === "post") {
    return false;
  }

  return HOOK_PARALLEL_DEFAULTS[hookName];
}

function toPluginHookError(
  pluginId: string,
  stage: RunnerHookName,
  cause: unknown,
  fatal: boolean,
): PluginHookError {
  const fallback = `Plugin "${pluginId}" failed in "${stage}"`;
  const message = cause instanceof Error && cause.message ? cause.message : fallback;

  return new PluginHookError({
    pluginId,
    stage,
    cause,
    fatal,
    message,
  });
}

function getFatalError(
  errors: readonly PluginHookError[],
): PluginHookError | undefined {
  return errors.find((error) => error.fatal);
}

async function runStageBatch(
  plugins: readonly NormalizedSvartzPlugin[],
  stage: StageName,
  ctx: PluginContext,
): Promise<PluginHookError[]> {
  const errors = await Promise.all(
    plugins.map(async (plugin) => {
      const hook = plugin[stage];
      if (!hook) return undefined;

      try {
        await hook.run(ctx);
        return undefined;
      } catch (cause) {
        return toPluginHookError(
          plugin.id,
          stage,
          cause,
          hook.options?.fatal ?? false,
        );
      }
    }),
  );

  return errors.filter((error): error is PluginHookError => error !== undefined);
}

async function runChangeBatch(
  plugins: readonly NormalizedSvartzPlugin[],
  event: ChangeEvent,
  ctx: PluginContext,
): Promise<PluginHookError[]> {
  const errors = await Promise.all(
    plugins.map(async (plugin) => {
      const hook = plugin.handleChange;
      if (!hook) return undefined;

      try {
        await hook.run(event, ctx);
        return undefined;
      } catch (cause) {
        return toPluginHookError(
          plugin.id,
          "handleChange",
          cause,
          hook.options?.fatal ?? false,
        );
      }
    }),
  );

  return errors.filter((error): error is PluginHookError => error !== undefined);
}

function sortPluginsForHandleChange(
  plugins: readonly NormalizedSvartzPlugin[],
): NormalizedSvartzPlugin[] {
  const withHook = plugins.filter((plugin) => plugin.handleChange != null);

  const tierOf = (plugin: NormalizedSvartzPlugin): number => {
    const enforce = plugin.handleChange?.options?.enforce;
    if (enforce === "pre") return 0;
    if (enforce === "post") return 2;
    return 1;
  };

  return withHook.sort((left, right) => tierOf(left) - tierOf(right));
}

async function executeStage(
  plugins: readonly RunnerPlugin[],
  stage: StageName,
  ctx: PluginContext,
): Promise<HookExecutionResult> {
  const normalizedPlugins = normalizeRunnerPlugins(plugins);
  const stagePlugins = sortPluginsForStage(normalizedPlugins, stage);
  const errors: PluginHookError[] = [];
  let parallelBatch: NormalizedSvartzPlugin[] = [];

  const flushParallelBatch = async () => {
    if (parallelBatch.length === 0) return undefined;

    const batchErrors = await runStageBatch(parallelBatch, stage, ctx);
    errors.push(...batchErrors);
    parallelBatch = [];
    return getFatalError(batchErrors);
  };

  for (const plugin of stagePlugins) {
    const hook = plugin[stage];
    if (!hook) continue;

    const shouldRunInParallel = getHookParallelValue(stage, hook);
    if (shouldRunInParallel) {
      parallelBatch.push(plugin);
      continue;
    }

    const parallelFatalError = await flushParallelBatch();
    if (parallelFatalError) {
      return { errors, fatalError: parallelFatalError };
    }

    const serialErrors = await runStageBatch([plugin], stage, ctx);
    errors.push(...serialErrors);

    const serialFatalError = getFatalError(serialErrors);
    if (serialFatalError) {
      return { errors, fatalError: serialFatalError };
    }
  }

  const parallelFatalError = await flushParallelBatch();
  if (parallelFatalError) {
    return { errors, fatalError: parallelFatalError };
  }

  return { errors };
}

async function executeHandleChange(
  plugins: readonly RunnerPlugin[],
  event: ChangeEvent,
  ctx: PluginContext,
): Promise<HookExecutionResult> {
  const normalizedPlugins = normalizeRunnerPlugins(plugins);
  const changePlugins = sortPluginsForHandleChange(normalizedPlugins);
  const errors: PluginHookError[] = [];
  let parallelBatch: NormalizedSvartzPlugin[] = [];

  const flushParallelBatch = async () => {
    if (parallelBatch.length === 0) return undefined;

    const batchErrors = await runChangeBatch(parallelBatch, event, ctx);
    errors.push(...batchErrors);
    parallelBatch = [];
    return getFatalError(batchErrors);
  };

  for (const plugin of changePlugins) {
    const hook = plugin.handleChange;
    if (!hook) continue;

    const shouldRunInParallel = getHookParallelValue("handleChange", hook);
    if (shouldRunInParallel) {
      parallelBatch.push(plugin);
      continue;
    }

    const parallelFatalError = await flushParallelBatch();
    if (parallelFatalError) {
      return { errors, fatalError: parallelFatalError };
    }

    const serialErrors = await runChangeBatch([plugin], event, ctx);
    errors.push(...serialErrors);

    const serialFatalError = getFatalError(serialErrors);
    if (serialFatalError) {
      return { errors, fatalError: serialFatalError };
    }
  }

  const parallelFatalError = await flushParallelBatch();
  if (parallelFatalError) {
    return { errors, fatalError: parallelFatalError };
  }

  return { errors };
}

async function runStages(
  plugins: readonly RunnerPlugin[],
  ctx: PluginContext,
  stages: readonly StageName[] = STAGE_NAMES,
): Promise<RunnerResult> {
  const collectedErrors: PluginHookError[] = [];

  for (const stage of stages) {
    const result = await executeStage(plugins, stage, ctx);
    collectedErrors.push(...result.errors);

    if (result.fatalError) {
      throw new PluginAggregateError({
        message: `Svartz pipeline failed in stage "${stage}"`,
        errors: collectedErrors,
      });
    }
  }

  if (collectedErrors.length > 0) {
    throw new PluginAggregateError({
      message: "Svartz pipeline completed with plugin errors",
      errors: collectedErrors,
    });
  }

  return { errors: collectedErrors };
}

async function runLifecycleHooks(
  plugins: readonly RunnerPlugin[],
  ctx: PluginContext,
  stages: readonly StageName[],
): Promise<RunnerResult> {
  return runStages(plugins, ctx, stages);
}

export {
  HOOK_PARALLEL_DEFAULTS,
  executeHandleChange,
  executeStage,
  runLifecycleHooks,
  runStages,
};
export type { HookExecutionResult, RunnerPlugin, RunnerResult };

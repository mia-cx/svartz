import type { SvartzPlugin, NormalizedSvartzPlugin } from "./types";
import { normalizePlugin } from "./utils";

type PluginFactory<
  T extends Record<string, unknown> = Record<string, never>,
> = (options?: T & { disabled?: boolean }) => SvartzPlugin;

/**
 * Wrap a plugin factory with runtime validation and hook normalization.
 * The returned factory produces normalized plugins ready for the runner.
 */
function definePlugin(
  plugin: SvartzPlugin,
): (options?: { disabled?: boolean }) => NormalizedSvartzPlugin;
function definePlugin<
  T extends Record<string, unknown> = Record<string, never>,
>(
  factory: PluginFactory<T>,
): (options?: T & { disabled?: boolean }) => NormalizedSvartzPlugin;
function definePlugin<
  T extends Record<string, unknown> = Record<string, never>,
>(
  factoryOrPlugin: PluginFactory<T> | SvartzPlugin,
): (options?: T & { disabled?: boolean }) => NormalizedSvartzPlugin {
  return (options) => {
    const pluginInstance =
      typeof factoryOrPlugin === "function"
        ? factoryOrPlugin(options)
        : ({
            ...factoryOrPlugin,
            ...(options?.disabled !== undefined
              ? { disabled: options.disabled }
              : {}),
          } satisfies SvartzPlugin);
    return normalizePlugin(pluginInstance);
  };
}

export { definePlugin, type PluginFactory };

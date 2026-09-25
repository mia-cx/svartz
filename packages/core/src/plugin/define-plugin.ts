import type { SvartzPlugin, NormalizedSvartzPlugin } from "./types";
import { normalizePlugin } from "./utils";

type PluginFactory<
  T extends object = object,
> = (options?: T & { disabled?: boolean }) => SvartzPlugin;

/**
 * Wrap a plugin factory with runtime validation and hook normalization.
 * The returned factory produces normalized plugins ready for the runner.
 */
function definePlugin(
  plugin: SvartzPlugin,
): (options?: { disabled?: boolean }) => NormalizedSvartzPlugin;
function definePlugin<
  T extends object = object,
>(
  factory: PluginFactory<T>,
): (options?: T & { disabled?: boolean }) => NormalizedSvartzPlugin;
function definePlugin<
  T extends object = object,
>(
  factoryOrPlugin: PluginFactory<T> | SvartzPlugin,
): (options?: T & { disabled?: boolean }) => NormalizedSvartzPlugin {
  return (options) => {
    const pluginInstance =
      typeof factoryOrPlugin === "function"
        ? factoryOrPlugin(options)
        : factoryOrPlugin;
    return normalizePlugin({
      ...pluginInstance,
      ...(options?.disabled !== undefined ? { disabled: options.disabled } : {}),
    });
  };
}

export { definePlugin, type PluginFactory };

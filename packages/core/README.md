# @svartz/core

Shared types, plugin contract, and utilities for Svartz. Effect-free, zero runtime dependencies.

## What lives here

### Shared types

Resolved configuration types used by `@svartz/config` and `@svartz/vite-plugin`:

- `ResolvedSvartzConfig`, `ResolvedVaultConfig`, `ResolvedVaultDefaults`
- `ResolvedFrontmatterConfig`, `ResolvedThemeConfig`, `ResolvedBuildConfig`

Pipeline types for the plugin system:

- `ProcessedFile`, `ChangeEvent`
- `Index`, `IndexEntry`, `IndexLink`
- `Graph`, `GraphTarget`
- `MaybePromise<T>`

Shared primitives:

- `LinkResolutionStrategy`, `TargetConfig`

### Plugin contract

Plugin interfaces and hook types:

- `SvartzPlugin` (author-facing), `NormalizedSvartzPlugin` (runner-facing)
- `PluginContext`, `PluginHook`, `PluginChangeHook`
- `HookOptions`, `PluginHookInput`, `PluginChangeHookInput`
- `StageName`, `STAGE_NAMES`

Utilities:

- `definePlugin(factory)` — wrap a plugin factory with validation + normalization
- `normalizePlugin(plugin)` — convert shorthand hooks to object form
- `mergePlugins(defaults, vault)` — layered merge with dedupe and disable
- `isPluginEnabled(plugin)` — check if a plugin is not disabled
- `sortPluginsForStage(plugins, stage)` — sort by enforce tier (`pre`/`default`/`post`)

Error classes (plain classes with `_tag`, Effect-compatible):

- `PluginValidationError` — invalid plugin shape
- `PluginHookError` — hook execution failure

## Usage

```ts
import type { ResolvedVaultConfig, ProcessedFile, SvartzPlugin } from "@svartz/core";
import { definePlugin, mergePlugins } from "@svartz/core";

const myPlugin = definePlugin(() => ({
  id: "my-plugin",
  transform(ctx) {
    for (const file of ctx.files) {
      file.content = file.content.toUpperCase();
    }
  },
}));
```

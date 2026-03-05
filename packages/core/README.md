# @svartz/core

Shared types, plugin contract, theme contract, and utilities for Svartz. Author-facing APIs are Effect-free; Effect Schema is used internally for runtime validation.

## What lives here

### Shared types

Resolved configuration types used by `@svartz/config` and `@svartz/vite-plugin`:

- `ResolvedSvartzConfig`, `ResolvedVaultConfig`, `ResolvedVaultDefaults`
- `ResolvedFrontmatterConfig`, `ResolvedThemeConfig`, `ResolvedBuildConfig`

Pipeline types for the plugin system:

- `ProcessedFile`, `ChangeEvent`, `RawLink`
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

Plugin utilities:

- `definePlugin(factory)` — wrap a plugin factory with validation + normalization
- `normalizePlugin(plugin)` — convert shorthand hooks to object form
- `mergePlugins(defaults, vault)` — layered merge with dedupe and disable
- `isPluginEnabled(plugin)` — check if a plugin is not disabled
- `sortPluginsForStage(plugins, stage)` — sort by enforce tier (`pre`/`default`/`post`)

Error classes (plain classes with `_tag`, Effect-compatible):

- `PluginValidationError` — invalid plugin shape
- `PluginHookError` — hook execution failure

Effect Schema (internal validation, exported for tooling):

- `PluginSchema`, `HookInputSchema`, `HookOptionsSchema` — canonical schema definitions
- `validatePluginShape(input)` — schema-based structural validation

### Theme contract

Theme interfaces:

- `SvartzTheme` — full theme manifest (id, version, contractVersion, layouts, routes, components, capabilities, etc.)
- `ThemeLayoutMap` — maps named slots to component loaders (required: `defaultPage`, `notePage`)
- `ThemeRouteDefinition` — route id, pattern, and metadata
- `ThemeComponentLoader` — sync or lazy reference to Svelte components
- `ThemeComponentRegistry` — named component entries (callout, backlinks, graphPanel, etc.)
- `ThemeArtifactRequirements` — declares which pipeline artifacts the theme needs
- `ThemeRenderCapabilities` — declarative flags for what the theme can render
- `ThemePluginPreset` — plugins the theme ships with

Theme utilities:

- `defineTheme(manifest | factory)` — validate and wrap a theme definition
- `validateTheme(theme)` — standalone validation
- `CONTRACT_VERSION` — current contract version constant (`1.0.0`)

Error classes:

- `ThemeValidationError` — invalid theme manifest

### Tailwind + Wrangler schemas

Canonical schema definitions (Effect Schema) and inferred types:

- `TailwindThemeConfigSchema`, `TailwindThemeConfig`, `DefaultThemeOverrideHints`
- `WranglerConfigSchema`, `WranglerConfigFieldsSchema`, and all building-block schemas/types

These are re-exported by `@svartz/config` for backward compatibility.

## Contract versioning

`contractVersion` is a semver string on both plugins and themes. The runner checks `semverMajor` compatibility against `CONTRACT_VERSION`.

- Themes: `contractVersion` is **required**
- Plugins: `contractVersion` is optional (backward compatible)

## Plugin merge order

Runner merge order (most generic to most specific):

1. Core plugins (`createCorePlugins()`)
2. Theme plugin preset (`theme.pluginPreset.plugins`)
3. Config defaults plugins (`config.defaults.plugins`)
4. Config vault plugins (`config.vault.plugins`)

Conflict: duplicate ID replaces existing entry in-place; new ID appends.

## Warning policy

Unknown keys on plugin and theme objects emit `console.warn` and are otherwise ignored. This policy applies uniformly to all schema-validated contracts.

## Usage

```ts
import type { ResolvedVaultConfig, ProcessedFile, SvartzPlugin } from "@svartz/core";
import { definePlugin, defineTheme, CONTRACT_VERSION } from "@svartz/core";

const myPlugin = definePlugin(() => ({
  id: "my-plugin",
  contractVersion: CONTRACT_VERSION,
  transformOfm(ctx) {
    for (const file of ctx.files) {
      file.content = file.content.toUpperCase();
    }
  },
}));

const myTheme = defineTheme({
  id: "my-theme",
  version: "0.1.0",
  contractVersion: CONTRACT_VERSION,
  layouts: {
    defaultPage: { default: DefaultLayout },
    notePage: { default: NoteLayout },
  },
  routes: [{ id: "note", pattern: "/notes/:slug" }],
});
```

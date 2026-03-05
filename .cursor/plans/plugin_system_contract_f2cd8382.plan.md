---
name: Plugin system contract
overview: Write and implement the plugin system contract with @svartz/core (shared types), @svartz/plugin (contract/utils), and runner behavior in @svartz/vite-plugin.
todos:
  - id: write-contract
    content: Write planning/contracts/plugin-implementation-contract.md with finalized decisions and runner boundaries
    status: completed
  - id: scaffold-core
    content: Scaffold packages/core for shared type contracts only (no runtime logic)
    status: completed
  - id: scaffold-plugin
    content: Scaffold packages/plugin for plugin contract, definePlugin, merge helpers, and utilities
    status: completed
  - id: wire-config
    content: Update @svartz/config to re-export @svartz/core types and keep PluginEntrySchema as Schema.Unknown for now
    status: completed
  - id: tests
    content: Add tests for definePlugin runtime checks, layered merge behavior, and helper utilities
    status: completed
  - id: capture-knowledge
    content: Add/update Cursor rules only if stable plugin conventions emerge during implementation
    status: completed
  - id: documentation
    content: Add package READMEs and contract docs with plugin authoring and runner integration examples
    status: completed
  - id: review-close
    content: Review edge cases, ordering semantics, error aggregation output, and package dependency graph
    status: completed
isProject: false
---

# Implementation Contract: @svartz/plugin

## Finalized Decisions

- **Architecture split**
  - `@svartz/core`: shared types only; depends on no Svartz packages.
  - `@svartz/plugin`: plugin contract + utilities/helpers; not a runner.
  - `@svartz/vite-plugin`: plugin runner and orchestration logic.
  - `@svartz/config`: may depend on `@svartz/plugin`; re-exports relevant `@svartz/core` types.
- **No cycle goal**
  - `@svartz/plugin` must not depend on `@svartz/config`.
  - Shared type contracts used by both live in `@svartz/core`.
- **Config shape**
  - `plugins[]` remains vault-scoped/defaults-scoped.
  - `PluginEntrySchema` stays `Schema.Unknown` for now.
- **Plugin model**
  - Unified plugin type with optional stage hooks.
  - Factory pattern: `pluginFactory(options?) => SvartzPlugin`.
  - Required immutable `id` on plugin instances.
  - Every factory supports `disabled?: boolean` in options.
  - `id` is static/immutable and not overridable via plugin options.
  - Hook behavior options are per-hook (not top-level): `options?: { fatal?: boolean; enforce?: 'pre' | 'post'; parallel?: boolean }`.
  - Support function shorthand for hooks (e.g. `transform(ctx) {}`) in addition to object form (`transform: { run, options }`).
- **Stages (canonical order)**
  - `buildStart -> configResolved -> discover -> parse -> resolveLinks -> transform -> index -> emit -> buildEnd`
- **Ordering**
  - Three tiers per stage: `pre`, `default`, `post`.
  - Default (no per-hook `enforce`) means `default`.
  - Sort precedence: stage -> enforce (`pre`, `default`, `post`) -> config array order.
  - Duplicate plugin IDs in a single list: warn, last wins.
- **Execution mode**
  - Hook defaults are fixed by runner.
  - Plugins can override parallelism per-hook via hook options.
- **Errors**
  - Optional plugin failures are non-fatal by default.
  - Hook-level `options.fatal?: boolean` can opt a plugin hook into build-failing behavior.
  - Fatal behavior is declared by each plugin per hook (`options.fatal`), not by runner special-casing.
  - Core plugins will set fatal behavior on their own hooks as a core-plugin implementation detail.
  - Errors are tagged, collected, and reported at end.
- **Incremental support**
  - Add `handleChange` as a stub now.
  - Exact `handleChange` event passthrough strategy (direct vs adapted) is intentionally deferred until plugin contract + core plugins are implemented.

## Dependency Graph

```mermaid
flowchart LR
    core[@svartz/core]
    plugin[@svartz/plugin]
    config[@svartz/config]
    vitePlugin[@svartz/vite-plugin]

    plugin --> core
    config --> core
    config --> plugin
    vitePlugin --> core
    vitePlugin --> plugin
    vitePlugin --> config
```



## Core Export Split

### Move to `@svartz/core` (canonical ownership)

- `ResolvedFrontmatterConfig`
- `ResolvedThemeConfig`
- `ResolvedBuildConfig`
- `ResolvedVaultDefaults`
- `ResolvedVaultConfig`
- `ResolvedSvartzConfig`
- `MaybePromise<T>`
- `ProcessedFile`
- `ChangeEvent`
- `Index`
- `Graph`

### Keep in `@svartz/config` (config-owned)

- Schema exports (`SvartzConfigSchema`, `VaultConfigSchema`, etc.)
- Schema-derived raw config types:
  - `SvartzConfig`
  - `VaultConfig`
  - `VaultOptions`
  - `SvartzDefaults`
  - `VaultThemeConfig`
  - `TargetConfig`
  - `LinkResolutionStrategy`
  - `FrontmatterFields`
- Config/runtime errors:
  - `ConfigNotFound`
  - `ConfigImportFailed`
  - `ConfigDecodeFailed`
  - `VaultPathInvalid`
  - `VaultIdNotFound`
  - `ConfigError`
- Runtime APIs:
  - `loadConfig`
  - `parseConfig`
  - `resolveConfig`
  - `getVault`
  - `defineConfig`
  - `runEffect`

### Re-export policy from `@svartz/config`

- Re-export resolved/shared types from `@svartz/core` for ergonomic imports.
- Do not re-introduce `VaultSummary`; that type is intentionally removed.

## Runner Boundary (Explicit)

- `@svartz/plugin` owns:
  - plugin interfaces/types
  - `definePlugin()` helper
  - merge/helper utilities
  - tagged plugin error types
- `@svartz/vite-plugin` owns:
  - stage orchestration and hook dispatch
  - enforce ordering and execution mode
  - fatal/non-fatal handling policy at runtime
  - aggregation and reporting of plugin failures

## Stage Semantics

- Each stage has core behavior (runner-owned) with plugin slots before/after.
- Enforce tiers:
  - `pre`: before core stage behavior
  - `default`: after core stage behavior
  - `post`: after default hooks
- Plugins can implement any subset of stage hooks; missing hooks are skipped.
- Runner executes only hooks that exist for the active stage.
- `discover` stage filtering is driven by resolved vault include/exclude patterns.
- Runner hydrates discover-core plugin options from resolved vault config (include/exclude) to keep traversal behavior consistent with config resolution.
- `parse` stage is where published/draft filtering runs (post-parse), since frontmatter fields are available there.

### Ordering Example

Given:
`plugins: [`
  `embedMarkdown({ transform: { run: ..., options: { enforce: 'pre' } } }),`
  `renderCallouts(),`
  `highlightSyntax(),`
`]`

- At `transform` stage:
  1. `embedMarkdown` (`pre`)
  2. core transform
  3. `renderCallouts`, `highlightSyntax` (default, config order)
  4. any `post` transform plugins

`filterDrafts` belongs in `parse` stage, e.g.:
`filterDrafts({ parse: { run: ..., options: { enforce: 'post' } } })`

## Type Contracts (Draft)

```ts
interface SvartzPlugin {
  readonly id: string;
  readonly disabled?: boolean;
  buildStart?: PluginHookInput;
  configResolved?: PluginHookInput;
  discover?: PluginHookInput;
  parse?: PluginHookInput;
  resolveLinks?: PluginHookInput;
  transform?: PluginHookInput;
  index?: PluginHookInput;
  emit?: PluginHookInput;
  buildEnd?: PluginHookInput;

  // Stub only (not executed in MVP)
  handleChange?: PluginChangeHookInput;
}
```

```ts
type HookOptions = {
  fatal?: boolean;
  enforce?: 'pre' | 'post';
  parallel?: boolean;
};

type PluginHook = {
  run: (ctx: PluginContext) => MaybePromise<void>;
  options?: HookOptions;
};

type PluginChangeHook = {
  run: (event: ChangeEvent, ctx: PluginContext) => MaybePromise<void>;
  options?: HookOptions;
};
```

```ts
type PluginHookInput =
  | ((ctx: PluginContext) => MaybePromise<void>)
  | PluginHook;

type PluginChangeHookInput =
  | ((event: ChangeEvent, ctx: PluginContext) => MaybePromise<void>)
  | PluginChangeHook;
```

```ts
interface PluginContext {
  readonly config: ResolvedSvartzConfig;
  readonly vault: ResolvedVaultConfig;
  files: ProcessedFile[];
  index?: Index;
  graph?: Graph;
  meta: Map<string, unknown>;
}
```

```ts
// Owned by @svartz/core (shared contracts)
type MaybePromise<T> = T | Promise<T>;

interface ProcessedFile {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  links?: string[];
  // additional stage artifacts are plugin-owned extensions
}

interface ChangeEvent {
  type: 'add' | 'change' | 'unlink';
  file: string;
  timestamp?: number;
  // pass-through extras from Vite/chokidar are allowed
  [key: string]: unknown;
}
```

## Merge Semantics (defaults + vault)

- Normalize each list first:
  - normalize `defaults.plugins` (warn on duplicate IDs, last wins)
  - normalize `vault.plugins` (warn on duplicate IDs, last wins)
- Base: normalized `defaults.plugins`
- Apply normalized `vault.plugins` in order:
  - same `id` -> replace in-place
  - new `id` -> append
- Remove `disabled` entries
- Final output preserves deterministic order (replaced plugins keep position)

## Runtime Checks (MVP)

- `id` exists and is a non-empty string (error)
- unknown hook keys (warn)
- duplicate plugin IDs within same list (warn, last wins)
- invalid per-hook `options.enforce` value (error)
- invalid per-hook `options.parallel` value (error)
- plugin hook shape invalid (error; hook must be `{ run, options? }`)
- function shorthand hooks are normalized to object form internally (`{ run, options: {} }`)
- plugin hook returns unsupported value (error; hooks return void/Promise)
- disabled plugin with hooks still present (warn; ignored at runtime)

## Runner Policies (to capture in contract)

- Stage defaults for execution mode (initial proposal):
  - sequential: `buildStart`, `configResolved`, `discover`, `parse`, `resolveLinks`, `transform`, `index`
  - parallel: `emit`, `buildEnd`
- Hook-level `options.parallel` is applied by runner per hook only after validation; invalid override values are validation errors.
- Error aggregation:
  - collect all plugin errors and print a consolidated report at end of stage/build
  - hooks/plugins with `options.fatal: true` cause final build failure
  - non-fatal plugin errors do not fail the build
- Core plugins are runner-owned defaults in `@svartz/vite-plugin`.
- Users can still override config or disable core plugins in `defaults.plugins` / `vault.plugins`; runner behavior follows merged plugin list.
- Which hooks are fatal is owned by each plugin definition (including core plugins), not by a runner-maintained "required core plugin" list.

## Quartz Mapping -> Svartz Core Plugin Set

Reference source: `packages/reference/quartz.config.ts`

Quartz configured plugin list:

- Transformers: `FrontMatter`, `CreatedModifiedDate`, `SyntaxHighlighting`, `ObsidianFlavoredMarkdown`, `GitHubFlavoredMarkdown`, `TableOfContents`, `CrawlLinks`, `Description`, `Latex`
- Filters: `RemoveDrafts`
- Emitters: `AliasRedirects`, `ComponentResources`, `ContentPage`, `FolderPage`, `TagPage`, `ContentIndex`, `Assets`, `Static`, `Favicon`, `NotFoundPage`, `CustomOgImages`

Initial Svartz core plugin candidate mapping:

- `discover` hook:
  - include/exclude + ignore patterns plugin (core)
- `parse` hook:
  - frontmatter normalization (`FrontMatter`, date fields)
  - draft/published filtering behavior (ported `RemoveDrafts`; runs post-parse)
- `resolveLinks` hook:
  - wikilink crawl/resolve (`CrawlLinks`)
- `transform` hook:
  - obsidian markdown transform (`ObsidianFlavoredMarkdown`)
  - gfm transform (`GitHubFlavoredMarkdown`)
  - toc extraction (`TableOfContents`)
  - description extraction (`Description`)
  - code highlighting (`SyntaxHighlighting`)
  - latex transform (`Latex`)
- `index` hook:
  - content index/search docs plugin (`ContentIndex`)
  - graph/backlinks artifact generation (part of index pipeline; no separate `graph` hook in MVP)
- `emit` hook:
  - pages (`ContentPage`, `FolderPage`, `TagPage`, `NotFoundPage`)
  - redirects (`AliasRedirects`)
  - assets/static/favicon (`Assets`, `Static`, `Favicon`)
  - component resources (`ComponentResources`)
  - optional OG generation (`CustomOgImages`)

Contract action item:

- Finalize the built-in core plugin array in `@svartz/vite-plugin` from this mapping, and use it as the source of truth for fatal core plugin behavior.
- Graph/backlinks UI rendering remains a UI/component concern; plugin/index layer only emits data artifacts.

## Utility Surface

### V1 / MVP utilities

- `definePlugin(factory)`
- `normalizePlugin(plugin)`
- `mergePlugins(defaultPlugins, vaultPlugins)`
- `isPluginEnabled(plugin)`
- `sortPluginsForStage(normalizedPlugins, stage)` (expects normalized plugin list)

### Future utilities

- include/exclude matcher helper (Vite/Rollup-style)
- frontmatter filter helpers (published/draft/tag)
- standardized diagnostics formatter
- plugin timing/profiling helper
- helper to scope plugins by vault id / target

## Files to Create / Modify

### New: `planning/contracts/plugin-implementation-contract.md`

Must include:

- finalized stage order and sorting rules
- package dependency graph and boundary ownership
- core vs optional plugin error policy
- runtime checks list and warning/error behavior
- utility surface (MVP vs future)
- `handleChange` stub scope note

### New: `packages/core/` (types only)

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/types.ts` (shared config/vault/pipeline type contracts)

### New: `packages/plugin/`

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/types.ts`
- `src/define-plugin.ts`
- `src/merge.ts`
- `src/utils.ts`
- `src/errors.ts`

### Modify: `packages/config/`

- Re-export core types from `@svartz/core`
- Keep `PluginEntrySchema = Schema.Unknown` until schema integration phase
- Remove `VaultSummary` from config type exports (already removed)
- Keep `@svartz/plugin` decoupled from unresolved config/schema types in `@svartz/config`

### Verify workspace

- `pnpm-workspace.yaml` uses `packages/*` and already includes new packages.

## Test Plan (MVP)

- `definePlugin` validates `id` and hook keys
- shorthand hook normalization (`hook(ctx) {}` -> `{ run, options }`) and `normalizePlugin` coverage
- merge replacement/append/disabled flows
- duplicate IDs warn and last wins
- enforce sorting and stable order behavior
- runtime warning/error classification
- `handleChange` type-level coverage (signature only)


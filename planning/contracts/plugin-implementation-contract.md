# Implementation Contract: @svartz/core + @svartz/plugins

## Overview

Three-package plugin system for Svartz:
- `@svartz/core` — shared types, plugin contract, theme contract, Effect Schema validation, tailwind/wrangler schemas
- `@svartz/plugins` — core pipeline plugin implementations
- `@svartz/vite-plugin` — runner/orchestration

In-memory pipeline inspired by Vite/Quartz. No Turbo caching for vault/index/graph; Turbo is only for package builds.

`@svartz/core` has an Effect runtime dependency (for Schema validation). Author-facing types remain plain TypeScript — plugin/theme authors never need Effect.

---

## Architecture

```
Plugin / Theme author
    │
    ▼
@svartz/core             ← types, definePlugin, defineTheme, merge, normalize, sort, errors, schemas
    │
    ▼
@svartz/plugins          ← core pipeline plugin implementations (12 plugins)
    │
    ▼
@svartz/vite-plugin      ← runner: stage dispatch, ordering, parallelism, error collection
```

### Dependency Graph

```
@svartz/plugins     ──▶  @svartz/core
@svartz/config      ──▶  @svartz/core  (re-exports tailwind/wrangler schemas)
@svartz/vite-plugin ──▶  @svartz/core, @svartz/plugins, @svartz/config
@svartz/theme-*     ──▶  @svartz/core
```

No package cycles. `@svartz/core` depends only on `effect`.

---

## Contract Versioning

- `CONTRACT_VERSION` constant exported from `@svartz/core` (currently `1.0.0`).
- Themes: `contractVersion` is **required** (semver string).
- Plugins: `contractVersion` is **optional** (backward compatible).
- Compatibility check: parse semver, require matching major version.
- Validation error on incompatibility includes expected major + received version.

---

## Theme Contract

### Core types (`@svartz/core`)

- `SvartzTheme` — id, version, contractVersion, layouts, routes + optional metadata and functional sections
- `ThemeLayoutMap` — required `defaultPage`, `notePage`; optional `root`, `tagPage`, `folderPage`, `notFoundPage`; extensible
- `ThemeRouteDefinition` — id, pattern; optional layoutSlot, component, prerender, priority, meta
- `ThemeComponentLoader` — sync `{ default: unknown }` or lazy `() => Promise<{ default: unknown }>`
- `ThemeComponentRegistry` — callout, backlinks, graphPanel, searchBox, toc, noteHeader; extensible
- `ThemeArtifactRequirements` — index, graph, backlinks (optional booleans); custom array
- `ThemeRenderCapabilities` — declarative flags for rendering features
- `ThemePluginPreset` — plugins merged with standard semantics (replace by id, append if new)

### Validation minima

- Must include route with `id: "note"` and `pattern` containing `:slug`
- Must include required layout slots (`defaultPage`, `notePage`)
- `contractVersion` must have matching semver major
- Unknown keys warn via `console.warn` and are ignored

### `defineTheme`

- Static object form: `defineTheme({ id: "...", ... })`
- Factory form: `defineTheme((opts) => ({ ... }))`
- Returns callable factory; validates on each invocation

---

## Plugin Merge Order + Specificity

Runner merge order:

1. Core plugins (`createCorePlugins()`)
2. Theme plugin preset (`theme.pluginPreset.plugins`)
3. Config defaults plugins (`config.defaults.plugins`)
4. Config vault plugins (`config.vault.plugins`)

Conflict rule:
- Duplicate ID → replace existing entry in-place (more specific layer wins)
- New ID → append
- Disabled → removed from final list
- Deterministic: replaced plugins keep their original position

---

## Stages (canonical order) — plugin-specific hooks

```
buildStart → configResolved → discoverFiles → parseFrontmatter → filterUnpublished
→ resolveLinks → transformOfm → transformGfm → transformToc → transformDescription
→ transformSyntax → transformLatex → indexContent → emitArtifacts → buildEnd
```

Each stage has three enforce tiers: `pre` → `default` → `post`. Sort precedence: stage → enforce tier → config array position. Stable sort preserves config order within tier.

### Core Plugin ID → Hook Map

| Plugin ID | Hook Key | Enforce | Parallel |
|---|---|---|---|
| `core:discover-files` | `discoverFiles` | default | no |
| `core:parse-frontmatter` | `parseFrontmatter` | default | no |
| `core:filter-unpublished` | `filterUnpublished` | **post** | no |
| `core:resolve-links` | `resolveLinks` | default | no |
| `core:transform-ofm` | `transformOfm` | default | no |
| `core:transform-gfm` | `transformGfm` | default | no |
| `core:transform-toc` | `transformToc` | default | no |
| `core:transform-description` | `transformDescription` | default | no |
| `core:transform-syntax` | `transformSyntax` | default | no |
| `core:transform-latex` | `transformLatex` | default | no |
| `core:index` | `indexContent` | default | no |
| `core:emit-artifacts` | `emitArtifacts` | default | **yes** |

All core hooks set `fatal: true`.

### Stage Dependency Chain

1. **discoverFiles** — no precondition. Postcondition: every `ProcessedFile` has `slug: string`.
2. **parseFrontmatter** — requires files with slugs. Postcondition: `frontmatter` and `rawLinks` populated.
3. **filterUnpublished** — requires frontmatter parsed (runs `post`).
4. **resolveLinks** — requires stable slugs for all files. Derives `allSlugs` from `ctx.files`.
5. **transforms** — require parsed frontmatter and resolved links.
6. **indexContent** — requires all transforms complete.
7. **emitArtifacts** — requires index built.

### `handleChange` (stub)

Declared in the type contract but not executed in MVP. Exact event passthrough strategy (direct Vite event vs adapted) is deferred until plugin runner is implemented.

---

## Type Contracts

### Owned by `@svartz/core`

Resolved config types:
- `ResolvedFrontmatterConfig`, `ResolvedThemeConfig`, `ResolvedBuildConfig`
- `ResolvedVaultDefaults`, `ResolvedVaultConfig`, `ResolvedSvartzConfig`

Pipeline types:
- `MaybePromise<T>`, `ProcessedFile`, `ChangeEvent`, `RawLink`
- `Index`, `IndexEntry`, `IndexLink`
- `Graph`, `GraphTarget`
- `LinkResolutionStrategy`, `TargetConfig`

Plugin contract:
- `SvartzPlugin`, `NormalizedSvartzPlugin`
- `PluginHook`, `PluginChangeHook`, `PluginHookInput`, `PluginChangeHookInput`
- `HookOptions`, `PluginContext`, `StageName`, `STAGE_NAMES`
- `definePlugin`, `normalizePlugin`, `mergePlugins`, `isPluginEnabled`, `sortPluginsForStage`
- `PluginValidationError`, `PluginHookError`

Theme contract:
- `SvartzTheme`, `ThemeLayoutMap`, `ThemeRouteDefinition`, `ThemeComponentLoader`
- `ThemeComponentRegistry`, `ThemeArtifactRequirements`, `ThemeRenderCapabilities`, `ThemePluginPreset`
- `defineTheme`, `validateTheme`, `ThemeValidationError`
- `CONTRACT_VERSION`

Effect Schema (internal, exported for tooling):
- `PluginSchema`, `HookInputSchema`, `HookOptionsSchema`, `FnSchema`
- `validatePluginShape`, `KNOWN_PLUGIN_KEYS`

Tailwind schemas/types (canonical home, re-exported by config):
- `TailwindThemeConfigSchema`, `TailwindThemeConfigPropertyRecordSchema`
- `TailwindThemeConfig`, `DefaultThemeOverrideHints`

Wrangler schemas/types (canonical home, re-exported by config):
- `WranglerConfigSchema`, `WranglerConfigFieldsSchema`, + all building-block schemas
- `WranglerConfig`, `WranglerConfigFields`, + all building-block types

### ProcessedFile contract

```ts
interface ProcessedFile {
  readonly path: string;
  slug: string;           // required after discoverFiles
  content: string;
  frontmatter?: Record<string, unknown>;
  rawLinks?: RawLink[];   // populated by parseFrontmatter
  links?: string[];       // populated by resolveLinks
}
```

### Index contract (canonical artifact)

```ts
interface Index {
  readonly version: string;
  readonly entries: readonly IndexEntry[];
  readonly graph: Readonly<Record<string, readonly string[]>>;
  readonly backlinks: Readonly<Record<string, readonly string[]>>;
}
```

Single source of truth for search, backlinks, and graph projections. `search` and `toc` are derived from the index — not independent artifacts.

---

## Plugin Model

- **Factory pattern:** `pluginFactory(options?) => SvartzPlugin`
- **`definePlugin(factory)`** wraps a factory with runtime validation + normalization.
- **Static form:** `definePlugin({ id, ... })` for zero-config plugins.
- **`id`** is immutable, required, non-empty string. Set by the factory, not overridable by options.
- **`contractVersion`** optional semver string; checked against `CONTRACT_VERSION` major by runner.
- **`disabled`** flag: canonical way to disable a plugin. Disabled plugins are removed during merge.
- **Hook shorthand:** `transformOfm(ctx) {}` normalizes to `{ run: transformOfm, options: {} }`.
- **Per-hook options:** `fatal`, `enforce`, `parallel` are set per-hook, not per-plugin.

---

## Published Semantics

| Frontmatter value | Result |
|---|---|
| missing / `null` / `undefined` | published |
| `true` | published |
| `"2025-01-01"` (datetime) | published |
| `false` | **unpublished** |
| `""` (empty string) | **unpublished** |

---

## Determinism Guarantees

Reference: `@packages/vault` slug.ts (fileToSlug) and indexer.ts (resolveLink).

- Canonical slug = full vault-relative path segments, extensionless, lowercased, special chars normalized.
- Two files at different paths never produce the same canonical slug.
- Alias collisions are excluded from alias-based resolution.
- Link strategy (`closest`/`shallowest`/`absolute`) has deterministic tie-breaks: shared depth → path depth → lexicographic.
- `core:index` output: entries sorted by slug, graph/backlinks keys sorted lexicographically.
- Emitted artifacts are stable across runs for identical input.

---

## Runtime Validation

### Effect Schema migration

Plugin validation is routed through Effect Schema (`validatePluginShape`) with a feature toggle for rollback to the legacy manual validation path. Parity criteria:

- Same invalid input classes throw `PluginValidationError`
- `_tag` and message prefix unchanged
- Warning count and category unchanged
- Shorthand normalization output unchanged
- Stage sorting/merge downstream behavior unchanged

### Runtime checks

| Check | Severity |
|---|---|
| `id` missing or empty string | error (throw) |
| Unknown hook/theme keys on object | warn |
| Duplicate plugin IDs in same list | warn (last wins) |
| Invalid `options.enforce` value | error (throw) |
| Invalid `options.parallel` value | error (throw) |
| Hook is neither function nor `{ run, options? }` | error (throw) |
| Disabled plugin with hooks present | warn |
| Theme missing required route or layout | error (throw) |
| Theme contractVersion major mismatch | error (throw) |

### Warning policy

Unknown keys emit `console.warn` with format `[svartz:plugin] plugin "ID" has unknown key "KEY"` or `[svartz:theme] theme "ID" has unknown key "KEY"`. Warnings are informational and never throw.

### Benchmark guardrail

Local dev-only benchmark tests measure normalization/validation overhead per plugin. Max regression threshold: 15%. Not used in CI.

---

## Utility Surface

### MVP

| Utility | Description |
|---|---|
| `definePlugin(factory)` | Wraps factory with validation + normalization |
| `defineTheme(manifest)` | Wraps theme with validation |
| `normalizePlugin(plugin)` | Convert shorthand hooks to object form |
| `mergePlugins(defaults, vault)` | Layered merge with dedupe and disable |
| `isPluginEnabled(plugin)` | `!plugin.disabled` |
| `sortPluginsForStage(plugins, stage)` | Sort by enforce tier; expects normalized plugins |
| `validatePluginShape(input)` | Effect Schema structural validation |
| `validateTheme(theme)` | Theme manifest validation |
| `createCorePlugins()` | Returns canonical ordered array of all 12 core plugins |
| `CORE_PLUGIN_IDS` | Readonly array of all core plugin IDs |
| `CONTRACT_VERSION` | Current contract version constant |

### Future

- Include/exclude matcher helper (Vite/Rollup-style)
- Frontmatter filter helpers
- Standardized diagnostics formatter
- Plugin timing/profiling helper
- Helper to scope plugins by vault id / target

---

## Deferred: @svartz/plugin-mdsvex

mdsvex is a rendering concern, not a core pipeline plugin. Deferred to an optional adapter package:
- Integrates at the renderer/emit boundary
- Does not own canonical parse/transform/index semantics
- Not included in the default core plugin set

---

## Ownership Boundaries

| Concern | Owner |
|---|---|
| Resolved config/vault/pipeline types, plugin/theme contract | `@svartz/core` |
| Tailwind/Wrangler schemas (canonical) | `@svartz/core` |
| Tailwind/Wrangler re-exports + config composition | `@svartz/config` |
| Core plugin implementations | `@svartz/plugins` |
| Schema-based config validation, resolution | `@svartz/config` |
| Stage dispatch, ordering, parallelism, error collection | `@svartz/vite-plugin` |
| Theme runtime resolution, SvelteKit route materialization | `@svartz/vite-plugin` |

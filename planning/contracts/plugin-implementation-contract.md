# Implementation Contract: @svartz/core + @svartz/plugins

## Overview

Three-package plugin system for Svartz:
- `@svartz/core` — shared types, plugin contract, utilities, errors
- `@svartz/plugins` — core pipeline plugin implementations
- `@svartz/vite-plugin` — runner/orchestration

In-memory pipeline inspired by Vite/Quartz. No Turbo caching for vault/index/graph; Turbo is only for package builds.

`@svartz/core` does NOT depend on `@svartz/config`. Plugin authors depend on `@svartz/core`; they never need Effect.

---

## Architecture

```
Plugin author
    │
    ▼
@svartz/core             ← shared types, definePlugin, merge, normalize, sort, errors
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
@svartz/config      ──▶  @svartz/core  (deferred; PluginEntrySchema = Unknown for now)
@svartz/vite-plugin ──▶  @svartz/core, @svartz/plugins, @svartz/config
```

No package cycles. `@svartz/core` depends on nothing.

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

Single source of truth for search, backlinks, and graph projections. UI consumers project from this artifact.

---

## Plugin Model

- **Factory pattern:** `pluginFactory(options?) => SvartzPlugin`
- **`definePlugin(factory)`** wraps a factory with runtime validation + normalization.
- **`id`** is immutable, required, non-empty string. Set by the factory, not overridable by options.
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

## Merge Semantics

1. **Normalize** each list: dedupe by `id` (warn on duplicates, last wins).
2. **Base:** normalized `defaults.plugins`.
3. **Apply** normalized `vault.plugins`:
   - Same `id` → replace in-place (keeps position).
   - New `id` → append.
4. **Remove** entries with `disabled: true`.
5. Output is deterministic: replaced plugins keep their original position.

---

## Error Policy

- Fatal behavior is **plugin-owned per-hook** via `options.fatal`.
- Core plugins set their own hooks to fatal; this is an implementation detail of core plugins.
- Runner collects all errors (tagged with plugin id + stage), reports consolidated at end.
- Hooks with `options.fatal: true` cause final build failure.
- Non-fatal errors are reported but do not halt the build.

Error types (`@svartz/core`):
- `PluginValidationError` — invalid plugin shape (thrown by `definePlugin`)
- `PluginHookError` — hook execution failure (produced by runner)

Both are plain classes with `_tag` discriminant (Effect-compatible, no Effect dependency).

---

## Runtime Checks (MVP)

| Check | Severity |
|---|---|
| `id` missing or empty string | error (throw) |
| Unknown hook keys on plugin object | warn |
| Duplicate plugin IDs in same list | warn (last wins) |
| Invalid `options.enforce` value | error (throw) |
| Invalid `options.parallel` value | error (throw) |
| Hook is neither function nor `{ run, options? }` | error (throw) |
| Disabled plugin with hooks present | warn |

---

## Utility Surface

### MVP

| Utility | Description |
|---|---|
| `definePlugin(factory)` | Wraps factory with validation + normalization |
| `normalizePlugin(plugin)` | Convert shorthand hooks to object form |
| `mergePlugins(defaults, vault)` | Layered merge with dedupe and disable |
| `isPluginEnabled(plugin)` | `!plugin.disabled` |
| `sortPluginsForStage(plugins, stage)` | Sort by enforce tier; expects normalized plugins |
| `createCorePlugins()` | Returns canonical ordered array of all 12 core plugins |
| `CORE_PLUGIN_IDS` | Readonly array of all core plugin IDs |

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
| Resolved config/vault/pipeline types, plugin contract | `@svartz/core` |
| Core plugin implementations | `@svartz/plugins` |
| Schema, validation, config resolution | `@svartz/config` |
| Stage dispatch, ordering, parallelism, error collection | `@svartz/vite-plugin` |

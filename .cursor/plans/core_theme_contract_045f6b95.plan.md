---
name: Core theme contract
overview: Define a full render-capable theme contract in @svartz/core with Effect-based runtime validation (while keeping author-facing contracts Effect-less), then migrate plugin validation with strict parity guarantees.
todos:
  - id: gate-1a-theme-contract
    content: Gate 1A — land theme contract types + defineTheme + tests + docs
    status: completed
  - id: gate-1b-shared-schemas
    content: Gate 1B — move tailwind/wrangler schema+types to core and re-export from config
    status: completed
  - id: migrate-plugin-validation-effect
    content: Gate 2 — migrate plugin runtime validation to Effect Schema with parity checks and warning behavior preserved
    status: completed
  - id: benchmark-guardrail
    content: Add local dev-only validation benchmark/guardrail to detect decode overhead regressions
    status: completed
  - id: config-alignment
    content: Verify explicit config re-export list and no-breaking-import-path compatibility
    status: completed
  - id: documentation
    content: Update contract docs, package READMEs, and boundaries with merge/versioning/warning semantics
    status: completed
  - id: review-close
    content: Verify runtime boundary, backward compatibility, and acceptance criteria
    status: completed
isProject: false
---

# Core Theme Contract + Effect Validation Migration Plan

## Goal

Implement a full theme contract in `@svartz/core` and migrate runtime validation to Effect Schema, while preserving an Effect-free author API and keeping `@svartz/core` independent from other Svartz packages.

## Locked Decisions

- `@svartz/core` may have an Effect runtime dependency.
- Author-facing contract types remain plain TypeScript (no Effect types leaked).
- Theme component references use one canonical `ThemeComponentLoader` type.
- Unknown keys must **warn, not throw** across all contract schemas (including migrated existing validators).
- Warning emission channel: `console.warn` (current plugin warning pattern).
- `search` and `toc` are derived from canonical `index` artifact (not independent required artifacts).
- Required theme route minima: at least one route with `id: "note"` and a `:slug` segment.
- Add contract version keys on both themes and plugins.
- Contract compatibility rule mirrors config versioning: match `semverMajor`.
- Plugin merge order for runner: `core -> theme -> config.defaults -> config.vault`.
- Duplicate plugin IDs follow default plugin merge semantics: replace existing by id, append if new.
- `defaults` in theme contract is kept, typed explicitly against tailwind config.
- Tailwind and Wrangler schema/types move to `@svartz/core`; `@svartz/config` re-exports.
- Split-gate execution: finish Gate 1A + 1B before Gate 2.

## Architecture Boundary

```mermaid
flowchart LR
  core[@svartz/core_contracts_and_validation]
  config[@svartz/config_re_exports]
  plugins[@svartz/plugins]
  vitePlugin[@svartz/vite-plugin_runtime_resolution]
  themePkg[@svartz/theme_package]

  config --> core
  plugins --> core
  themePkg --> core
  vitePlugin --> core
  vitePlugin --> themePkg
```



- `@svartz/core`: types/contracts, define helpers, Effect-based decode/validation utilities.
- `@svartz/vite-plugin`: runtime theme/module resolution, route materialization into SvelteKit, merge orchestration.
- `@svartz/config`: schema-facing package that re-exports shared core contracts/types/schemas.

## Theme Contract Draft (`@svartz/core`)

### Core types

- `SvartzTheme`
  - required: `id`, `version`, `contractVersion`, `layouts`, `routes`
  - optional metadata: `displayName`, `description`, `author`, `homepage`
  - optional functional sections: `components`, `capabilities`, `artifactRequirements`, `pluginPreset`, `defaults`, `hooks`
- `ThemeLayoutMap`
  - required: `defaultPage`, `notePage`
  - optional: `root`, `tagPage`, `folderPage`, `notFoundPage`
  - extensible custom slots
- `ThemeRouteDefinition`
  - required: `id`, `pattern`
  - optional: `layoutSlot`, `component`, `prerender`, `priority`, `meta`
- `ThemeComponentLoader`
  - canonical type for Svelte entries, e.g. module default or direct component constructor
  - contract includes both sync and lazy forms
- `ThemeComponentRegistry`
  - optional named entries: `callout`, `backlinks`, `graphPanel`, `searchBox`, `toc`, `noteHeader`
  - extensible custom components
- `ThemeArtifactRequirements`
  - `index`, `graph`, `backlinks` (optional booleans)
  - no separate required `search`/`toc` artifacts (derived from index)
  - optional `custom: readonly string[]`
- `ThemeRenderCapabilities`
  - optional flags for callouts/wikilinks/embeds/code/syntax/math/toc/backlinks/graph/search
  - declarative capability metadata with optional enforcement checks
- `ThemePluginPreset`
  - `plugins?: readonly SvartzPlugin[]`
  - merged with same plugin semantics: replace by id if existing, append if new
- `defineTheme` overloads
  - static object form
  - factory form

### Validation minima

- Must include route with `id: "note"` and `pattern` containing `:slug`.
- Must include required layout slots.
- Unknown keys warn via `console.warn` and are ignored for compatibility.

## Plugin + Theme Contract Versioning

- Add `contractVersion` to plugin and theme contract surfaces.
- Compatibility check: parse semver and require matching major version.
- Validation error on incompatibility includes expected major + received version.

## Plugin Merge Order + Specificity

Runner merge order:

1. core plugins
2. theme plugin preset
3. config defaults plugins
4. config vault plugins

Conflict rule:

- Duplicate ID => replace existing entry by id (more specific layer wins).
- New ID => append.
- Preserve deterministic order and existing dedupe behavior.
- If this differs from current general plugin merge behavior, adjust general merge behavior to match this default.

## Effect Migration Scope

### Gate 1A (must complete first)

1. Add theme type modules and exports in core.
2. Add `defineTheme` + runtime validation.
3. Add tests for valid/invalid theme manifests and route minima.
4. Update docs for theme contract, versioning, merge order, and boundaries.

### Gate 1B (must complete before Gate 2)

1. Move tailwind schema/types into core.
2. Move wrangler schema/types into core.
3. Re-export moved schema/types from config.
4. Validate no import-path breakage for existing config consumers.

### Gate 2 (starts only after Gate 1A + 1B pass)

1. Add internal plugin schema module using Effect Schema.
2. Route plugin validation through Effect decode path.
3. Preserve warning behavior (unknown keys, disabled-with-hooks) and error class/tags.
4. Remove old manual validation path once parity tests pass.

### Rollback strategy

- Keep old manual validation code path behind a temporary internal feature toggle during migration.
- If parity fails late, revert to manual path while retaining schema module/tests.

## Unknown-Key Warning Policy

Apply consistently to:

- Plugin validation schemas
- Theme validation schemas
- Any migrated schema-based validators from existing manual validators

Implementation note:

- Use permissive decode + explicit unknown-key scanner that emits `console.warn` diagnostics.

## Tailwind + Wrangler Migration to Core

Move schema+types to `@svartz/core`:

- Tailwind schema/types currently under `packages/config/src/schemas/tailwind.ts` + `types/tailwind.ts`
- Wrangler schema/types currently under `packages/config/src/schemas/wrangler.ts` + `types/wrangler.ts`

`@svartz/config` responsibilities after move:

- import/re-export core schema/types
- keep config composition/resolution logic

Rationale:

- enables reuse in CLI and other runtime validators without cross-package coupling.

## Parity Criteria (Plugin Validation)

Define explicit parity matrix for migration:

- same invalid input classes still throw `PluginValidationError`
- `_tag` and key message prefix unchanged
- warning count and warning category unchanged
- shorthand normalization output unchanged
- stage sorting/merge downstream behavior unchanged

## Benchmark / Guardrail (local dev only)

- benchmark normalize/validate over representative plugin list sizes
- compare baseline manual vs Effect decode path
- enforce max regression threshold (documented in benchmark script)
- run in local development workflow (not CI for now)

## Config Alignment Checks (explicit)

Define a concrete re-export checklist in `@svartz/config`:

- tailwind schema/type exports mapped 1:1 to new core locations
- wrangler schema/type exports mapped 1:1 to new core locations
- existing public import paths continue to resolve
- add non-breaking import-path tests to guard regressions

## Files to Add/Update

- `packages/core/src/theme/types.ts`
- `packages/core/src/theme/define-theme.ts`
- `packages/core/src/plugin/schema.ts`
- `packages/core/src/plugin/types.ts` (`contractVersion` key)
- `packages/core/src/plugin/utils.ts` (Effect decode path + warning scanner)
- `packages/core/src/index.ts` exports
- `packages/core/src/{tailwind,wrangler}/...` (new shared schema/type modules)
- `packages/config/src/**` re-exports and composition wiring
- `packages/core/tests/**` theme + parity + import-compat + benchmark guardrail tests
- docs/contracts and README updates

## Documentation Updates Required

- update plugin/theme contract docs with:
  - `contractVersion` + semverMajor compatibility policy
  - merge order and specificity rules
  - unknown-key warn semantics + warning sink
  - derived `search`/`toc` semantics from `index`
  - core/config schema ownership alignment and re-export map

## Risks / Guardrails

- Avoid runtime theme resolution logic in core.
- Avoid exposing Effect types in author-facing interfaces.
- Prevent silent behavior changes during validation migration with strict parity tests.
- Keep route minima enforcement deterministic and explicit.


# Implementation Summary

Svartz documentation vault (`vaults/docs`) containing complete reference for @svartz/core, @svartz/plugins, and @svartz/config contracts.

## Documentation Structure

### Entry Points

1. **[[README]]** — Overview and quick navigation
2. **[[reference/quick-reference]]** — Fast lookup for common tasks and code patterns

### Contracts (Canonical References)

3. **[[contracts/plugin-contract]]** — Plugin system contract (types, validation, utilities)
4. **[[contracts/theme-contract]]** — Theme system contract (types, defineTheme factory, validation)
5. **[[contracts/config-contract]]** — Configuration schema and API

### Plugin System

6. **[[plugins/overview]]** — All 12 core plugins reference with quick lookup table
7. **[[plugins/discover-files]]** — Core discover plugin (first stage)
8. **`plugins/utilities`** — Plugin utilities and internal modules

## Coverage

### @svartz/core ✅

**Plugin System:**

- `SvartzPlugin` interface ✅
- `PluginContext` interface ✅
- `HookInput` type ✅
- Hook validation and normalization ✅
- `normalizePlugin()` function ✅
- `sortPluginsForStage()` function ✅
- `mergePlugins()` function ✅
- Plugin merge order and conflict resolution ✅
- Error handling (`PluginValidationError`) ✅
- Stage diagram and descriptions ✅

**Theme System:**

- `SvartzTheme` interface ✅
- `ThemeLayoutMap` interface ✅
- `ThemeComponentLoader` type ✅
- `ThemeRouteDefinition` interface ✅
- `ThemeComponentRegistry` interface ✅
- `ThemeArtifactRequirements` interface ✅
- `ThemeRenderCapabilities` interface ✅
- `ThemePluginPreset` interface ✅
- `defineTheme()` factory (static and factory forms) ✅
- `validateTheme()` function ✅
- Validation rules and error handling ✅
- `CONTRACT_VERSION` constant ✅

**Schemas (Moved to Core):**

- Tailwind schema and types ✅
- Wrangler schema and types ✅

### @svartz/plugins ✅

**Core Plugins:**

- `discoverFiles()` — discover stage ✅
- `filterUnpublished()` — filterUnpublished stage ✅
- `transformOfm()` — transformContent stage ✅
- `transformGfm()` — transformContent stage ✅
- `transformSyntax()` — transformContent stage ✅
- `transformLatex()` — transformContent stage ✅
- `transformDescription()` — indexContent stage ✅
- `indexContent()` — indexContent stage ✅
- `resolveLinks()` — resolveLinks stage ✅
- `emitArtifacts()` — emit stage ✅

**Internal Utilities:**

- Slug generation (`generateSlug`, `resolveSlugConflicts`) ✅
- Gitignore parsing (`createIgnoreMatcher`) ✅
- Datetime utilities (`toISOString`, `fileStatsToISO`) ✅
- Frontmatter parsing (`parseFrontmatter`, `getFrontmatterField`) ✅
- Link resolution (`parseWikilinks`, `resolveWikilink`) ✅

### @svartz/config ✅

**Public API:**

- `loadConfig()` function ✅
- `resolveConfig()` function ✅
- `loadAndResolveConfig()` function ✅

**Types:**

- `SvartzConfig` interface ✅
- `ResolvedSvartzConfig` interface ✅
- `SvartzDefaults` interface ✅
- `VaultConfig` interface ✅
- `FrontmatterFieldsConfig` interface ✅
- `TargetConfig` union type ✅
- `ThemeConfig` type ✅

**Errors:**

- `ConfigLoadError` ✅
- `ConfigValidationError` ✅
- `ConfigResolutionError` ✅

**Schema:**

- All Effect Schema definitions referenced ✅

---

## JSDoc Alignment

**Status:** ✅ All public functions include JSDoc

### JSDoc Coverage Checklist

- ✅ Function signatures with `@param` and `@returns`
- ✅ `@description` for detailed behavior
- ✅ `@example` code blocks for usage
- ✅ `@throws` for error cases
- ✅ `@see` links to related documentation
- ✅ `@template` for generic types
- ✅ Tagged error types documented with `@field`

### Files with JSDoc

**@svartz/core:**

- `src/plugin/types.ts` — interfaces documented ✅
- `src/plugin/utils.ts` — `normalizePlugin`, `sortPluginsForStage`, `mergePlugins` documented ✅
- `src/theme/types.ts` — all theme types documented ✅
- `src/theme/define-theme.ts` — `defineTheme` factory documented ✅

**@svartz/plugins:**

- `src/discover-files.ts` — brief JSDoc + implementation ✅
- `src/filter-unpublished.ts` — brief JSDoc + implementation ✅
- All plugin files include JSDoc headers ✅
- Internal utilities in `src/internal/` include JSDoc ✅

**@svartz/config:**

- `src/index.ts` — public API functions documented ✅
- Error classes documented with `@field` ✅

---

## Function-Level Documentation

### @svartz/core

#### Plugin System Functions

```typescript
// packages/core/src/plugin/utils.ts
export function normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin;
export function sortPluginsForStage(
  plugins: SvartzPlugin[],
  stage: string,
): SvartzPlugin[];
export function mergePlugins(layers: SvartzPlugin[][]): SvartzPlugin[];
```

#### Theme System Functions

```typescript
// packages/core/src/theme/define-theme.ts
export function defineTheme(theme: SvartzTheme): () => SvartzTheme;
export function defineTheme<T>(
  factory: (options?: T) => SvartzTheme,
): (options?: T) => SvartzTheme;
export function validateTheme(theme: SvartzTheme): void;
```

### @svartz/plugins

#### Core Plugins

```typescript
// Each returns SvartzPlugin via definePlugin()
export const discoverFiles: () => SvartzPlugin;
export const filterUnpublished: () => SvartzPlugin;
export const transformOfm: () => SvartzPlugin;
export const transformGfm: () => SvartzPlugin;
export const transformSyntax: () => SvartzPlugin;
export const transformLatex: () => SvartzPlugin;
export const transformDescription: () => SvartzPlugin;
export const indexContent: () => SvartzPlugin;
export const resolveLinks: () => SvartzPlugin;
export const emitArtifacts: () => SvartzPlugin;
```

#### Utilities

```typescript
// packages/plugins/src/internal/slug.ts
export function generateSlug(filePath: string): string;
export function resolveSlugConflicts(files: ProcessedFile[]): ProcessedFile[];

// packages/plugins/src/internal/ignore.ts
export function createIgnoreMatcher(
  vaultPath: string,
  include: string[],
  exclude: string[],
): (filePath: string) => boolean;

// packages/plugins/src/internal/datetime.ts
export function toISOString(input: unknown): string | undefined;
export function fileStatsToISO(stats: fs.Stats): string;

// packages/plugins/src/internal/parse.ts
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  content: string;
};
export function getFrontmatterField(
  frontmatter: Record<string, unknown>,
  fieldName: string,
): unknown;

// packages/plugins/src/internal/resolve.ts
export function parseWikilinks(content: string): RawLink[];
export function resolveWikilink(
  target: string,
  files: ProcessedFile[],
  strategy: "closest" | "shallowest" | "absolute",
): string | undefined;
```

### @svartz/config

```typescript
// packages/config/src/index.ts
export function loadConfig(path: string): Promise<SvartzConfig>;
export function resolveConfig(
  config: SvartzConfig,
): Promise<ResolvedSvartzConfig>;
export function loadAndResolveConfig(
  path: string,
): Promise<ResolvedSvartzConfig>;

// Errors (exported as tagged Error classes)
export class ConfigLoadError extends Error {
  _tag: "ConfigLoadError";
  filePath: string;
  cause: Error;
}
export class ConfigValidationError extends Error {
  _tag: "ConfigValidationError";
  details: ValidationErrorDetail[];
}
export class ConfigResolutionError extends Error {
  _tag: "ConfigResolutionError";
}
```

---

## Behavior Documentation

### Plugin Lifecycle

```
1. Author defines plugin via definePlugin()
2. Plugin normalized by normalizePlugin() (validates, converts hooks)
3. Plugins from 4 layers merged via mergePlugins() (by-id conflict resolution)
4. Plugins sorted per-stage via sortPluginsForStage() (pre/default/post enforcement)
5. Runner dispatches plugins to stages:
   - discover → files discovered, slugs generated
   - filterUnpublished → drafts removed
   - transformContent → markdown transformed (parallel by default)
   - indexContent → index + metadata built
   - resolveLinks → wikilinks resolved (stub)
   - emit → artifacts written
6. Errors collected (fatal stops pipeline; non-fatal continues)
```

See [[contracts/plugin-contract]] for full details.

### Theme Lifecycle

```
1. Author defines theme via defineTheme() (static or factory)
2. Theme validated on each invocation (contractVersion, required fields, etc.)
3. Runner loads theme, accesses layouts/routes/components
4. Theme plugin preset merged into standard 4-layer merge
5. Vite plugin uses theme layouts + routes for SvelteKit route generation
```

See [[contracts/theme-contract]] for full details.

### Config Resolution

```
1. Raw config loaded from file (loadConfig)
2. Schema validated (Effect Schema)
3. Defaults applied to each vault (resolveConfig)
4. Paths resolved to absolute
5. Final ResolvedSvartzConfig returned (Promise)
6. Consumers (CLI, Vite, etc.) use resolved config
```

See [[contracts/config-contract]] for full details.

---

## Next Steps for Implementation

This documentation vault serves as the **canonical reference** for:

1. **Feature authors** implementing custom plugins/themes
2. **Developers** understanding the system architecture
3. **Maintenance** — update docs when contracts change
4. **Debugging** — understand behavior at each stage

### Best Practices

- Keep contracts in sync with source code JSDoc
- When updating a function signature, update both JSDoc and vault docs
- Use `@see` links to cross-reference related contracts
- Test all code examples in the vault docs

---

## See Also

- `planning/contracts/plugin-implementation-contract.md` — technical design decisions
- `planning/contracts/config-implementation-contract.md` — config design decisions
- `.cursor/rules/plugin-conventions.mdc` — agent-facing guidelines

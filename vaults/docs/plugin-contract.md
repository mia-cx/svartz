# Authoring Plugins

Complete contract for the `@svartz/core` plugin system. Author-facing types with no Effect dependencies.

## Overview

The plugin system provides extensible hooks for vault processing, organized into 6 stages with pre/default/post enforcement levels. Plugins can:
- Disable/enable conditionally
- Run parallel or sequential
- Throw fatal errors or collect warnings
- Override configuration in more specific layers

## Core Types

### `SvartzPlugin`

Main plugin interface (author-facing, **Effect-free**).

```typescript
interface SvartzPlugin {
  readonly id: string;
  readonly contractVersion?: string;
  readonly disabled?: boolean;
  
  // Hooks (optional)
  readonly discover?: HookInput;
  readonly filterUnpublished?: HookInput;
  readonly transformContent?: HookInput;
  readonly indexContent?: HookInput;
  readonly resolveLinks?: HookInput;
  readonly emit?: HookInput;
  readonly handleChange?: HookInput;
}
```

**Fields:**
- `id` — Unique plugin identifier (e.g., `"core:discover-files"`, `"custom:my-plugin"`)
  - Required, must be non-empty string
  - Used for merging and deduplication
- `contractVersion` — Optional semver string for compatibility checks
  - If provided, major version must match `CONTRACT_VERSION` from core
  - Validation error on mismatch
- `disabled` — Optional boolean; if true, plugin is excluded from final list
  - Useful for config-driven enable/disable

### `HookInput`

Union type for defining a hook. Supports both shorthand and full form.

```typescript
type HookInput = 
  | ((ctx: PluginContext) => void | Promise<void>)
  | HookObject;

interface HookObject {
  run: (ctx: PluginContext) => void | Promise<void>;
  options?: HookOptions;
}

interface HookOptions {
  fatal?: boolean;          // If true, throw stops pipeline
  enforce?: "pre" | "post"; // Execution order guarantee
  parallel?: boolean;       // Run concurrently with other default hooks?
}
```

**Examples:**

```typescript
// Shorthand function
{
  id: "my:plugin",
  discover: (ctx) => { /* ... */ }
}

// Full form with options
{
  id: "my:plugin",
  transformContent: {
    run: (ctx) => { /* ... */ },
    options: { fatal: true, enforce: "post", parallel: false }
  }
}
```

### `PluginContext`

Passed to every hook. Contains processed file list, configuration, and metadata.

```typescript
interface PluginContext {
  readonly stage: "discover" | "filterUnpublished" | "transformContent" | "indexContent" | "resolveLinks" | "emit";
  readonly files: ProcessedFile[];
  readonly config: ResolvedSvartzConfig;
  readonly vaultConfig: ResolvedVaultConfig;
}

interface ProcessedFile {
  readonly path: string;        // Relative path from vault root
  readonly slug: string;        // Canonical slug (post-discover, stable across runs)
  readonly content: string;     // File contents (markdown)
  readonly frontmatter: Record<string, unknown>;
  readonly published: boolean;  // Based on publishedField from config
  readonly createdAt?: string;  // ISO timestamp if extractable
  readonly updatedAt?: string;  // ISO timestamp if extractable
  readonly description?: string; // First 1-3 sentences (post-description-extraction)
  readonly links?: RawLink[];    // Wikilinks (post-parse)
  readonly backlinks?: string[]; // Referring files (post-resolve-links)
  readonly [custom: string]: any;
}
```

**Mutation policy:**
- Hooks **can** mutate `files` (add/remove items, modify properties)
- `ProcessedFile` is mutable; plugins transform in-place
- Must preserve slug stability across runs (used for deterministic resolution)

### `NormalizedSvartzPlugin`

Internal form after `normalizePlugin` validates and normalizes input.

```typescript
interface NormalizedSvartzPlugin {
  readonly id: string;
  readonly contractVersion?: string;
  readonly disabled: boolean;
  readonly discover?: { run: (...) => void | Promise<void>, options?: HookOptions };
  readonly filterUnpublished?: { ... };
  readonly transformContent?: { ... };
  readonly indexContent?: { ... };
  readonly resolveLinks?: { ... };
  readonly emit?: { ... };
  readonly handleChange?: { ... };
}
```

Normalized form ensures every hook (if present) has explicit `run` and `options` properties.

## Stages

### 1. Discover
**Purpose:** Traverse vault, read file contents, parse frontmatter  
**Precondition:** Vault directory exists  
**Postcondition:** All files have `slug` (stable, deterministic)

**Context:**
- `files` — empty or seeded with initial traversal
- `frontmatter` — parsed YAML from `---` blocks
- `content` — raw markdown (unparsed)

**Core plugin:** `core:discover-files`

---

### 2. Filter Unpublished
**Purpose:** Remove draft/unpublished files  
**Precondition:** discover completed  
**Postcondition:** Only published files remain in `ctx.files`

**Core plugin:** `core:filter-unpublished`

---

### 3. Transform Content
**Purpose:** Transform markdown content (syntax highlighting, LaTeX, GFM processing)  
**Precondition:** discover, filterUnpublished completed  
**Postcondition:** `content` field updated in-place

**Enforce policy:** Transformers can run in parallel (default) unless `parallel: false`

**Core plugins:**
- `core:transform-gfm` — GitHub Flavored Markdown
- `core:transform-syntax` — Syntax highlighting prep
- `core:transform-latex` — LaTeX/math block handling
- `core:transform-ofm` — Obsidian frontmatter features (callouts, etc.)

---

### 4. Index Content
**Purpose:** Build search index, manifest, and extract metadata  
**Precondition:** discover, transformContent completed  
**Postcondition:** `description`, `links[]` populated; artifacts ready

**Core plugins:**
- `core:transform-description` — Extract first 1-3 sentences
- `core:index-content` — Build search index, manifest

---

### 5. Resolve Links
**Purpose:** Resolve wikilinks to final slugs  
**Precondition:** discover completed with **stable slugs for all files**  
**Postcondition:** `backlinks[]` populated; wikilink references resolved

**Core plugin:** `core:resolve-links` (stub; custom themes may add resolvers)

---

### 6. Emit
**Purpose:** Write final artifacts (index.json, graph, backlinks)  
**Precondition:** All previous stages completed  
**Postcondition:** Artifacts written to disk

**Core plugin:** `core:emit-artifacts`

---

### 7. Handle Change (stub)
**Purpose:** Hot reload in dev mode  
**Precondition:** File change detected  
**Postcondition:** Artifacts re-generated

**Current:** Intentionally a stub; Vite plugin passes change event through.

---

## Error Handling

### Validation Errors

`normalizePlugin()` throws `PluginValidationError` on invalid input:

```typescript
interface PluginValidationError extends Error {
  readonly _tag: "PluginValidationError";
  readonly pluginId: string;
  readonly message: string;
}
```

**Cases:**
- Non-string `id` → error
- `id` is empty string → error
- Hook is not a function or object → error
- Hook object missing `run` property → error
- Unknown keys → `console.warn` (non-fatal)

**Example:**
```typescript
import { normalizePlugin } from "@svartz/core";

try {
  const plugin = normalizePlugin({
    id: "", // Empty!
    discover: (ctx) => { /* ... */ }
  });
} catch (err) {
  if (err._tag === "PluginValidationError") {
    console.error(`Plugin ${err.pluginId}: ${err.message}`);
  }
}
```

### Fatal Errors (Runtime)

If a hook sets `fatal: true`, a throw in that hook stops the pipeline immediately. The runner collects and re-throws after cleanup.

```typescript
// Hook throws; fatal
const plugin = {
  id: "my:plugin",
  discover: {
    run: (ctx) => { throw new Error("Oh no!"); },
    options: { fatal: true }
  }
};
```

### Non-Fatal Warnings

Unknown keys in plugin objects emit `console.warn` and are ignored:

```typescript
const plugin = {
  id: "my:plugin",
  unknownField: true, // ← warns: "[svartz:plugin] plugin 'my:plugin' has unknown key 'unknownField'"
  discover: (ctx) => { /* ... */ }
};
```

---

## Utility Functions

### `normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin`

Validates plugin structure and normalizes hooks to `HookObject` form.

- **Throws:** `PluginValidationError` if validation fails
- **Returns:** Normalized plugin with all hooks as explicit objects
- **Side effects:** Warns to console for unknown keys

**Usage:**
```typescript
const raw = { id: "my:plugin", discover: (ctx) => { /* ... */ } };
const normalized = normalizePlugin(raw);
// normalized.discover === { run: (...), options: {} }
```

---

### `sortPluginsForStage(plugins: SvartzPlugin[], stage: string): SvartzPlugin[]`

Sorts plugins for a given stage based on `enforce` setting:

1. `enforce: "pre"` plugins first (serial order preserved)
2. `enforce: "default"` / undefined next (can run parallel)
3. `enforce: "post"` plugins last (serial order preserved)

**Usage:**
```typescript
const plugins = [
  { id: "a", transformContent: { run: ..., options: { enforce: "post" } } },
  { id: "b", transformContent: (ctx) => { /* default */ } },
  { id: "c", transformContent: { run: ..., options: { enforce: "pre" } } }
];

const sorted = sortPluginsForStage(plugins, "transformContent");
// sorted order: c (pre), b (default), a (post)
```

---

### `mergePlugins(layers: SvartzPlugin[][]): SvartzPlugin[]`

Merges plugin lists from multiple layers (core, theme, config defaults, config vault) with specificity-based conflict resolution.

**Merge rule:**
- Duplicate ID (same `id` in multiple layers) → more specific layer wins (replaces in-place)
- New ID → appends

**Specificity order (most to least):**
1. Config vault plugins (most specific)
2. Config defaults plugins
3. Theme plugin preset
4. Core plugins (least specific)

**Returns:** Merged list, deterministic order

**Usage:**
```typescript
const corePlugins = [{ id: "core:discover", ... }];
const themePlugins = [{ id: "custom:highlight", ... }];
const defaultsPlugins = [{ id: "core:discover", /* override config */ }];
const vaultPlugins = [{ id: "core:discover", /* vault-specific */ }];

const final = mergePlugins([corePlugins, themePlugins, defaultsPlugins, vaultPlugins]);
// final has one "core:discover" (from vault), plus unique IDs
```

---

## Disabled Plugins

Plugins with `disabled: true` are excluded from the final list after merge.

```typescript
const plugin = { id: "my:plugin", disabled: true, discover: (ctx) => { /* ... */ } };
normalizePlugin(plugin); // ← normalized.disabled === true

// After merge, disabled plugins are filtered out
const merged = mergePlugins([
  [{ id: "a", ... }],
  [{ id: "b", disabled: true, ... }]
]);
// merged = [{ id: "a", ... }] (b excluded)
```

---

## JSDoc Examples

All core plugins include JSDoc. Example:

```typescript
/**
 * Core plugin for vault discovery and file traversal.
 *
 * @description
 * Traverses vault directory, reads file contents, parses frontmatter YAML,
 * and generates deterministic slugs for every file. Slug generation uses
 * path normalization and conflict detection to ensure stability across runs.
 *
 * @example
 * ```ts
 * const plugin = discoverFiles();
 * // In pipeline:
 * runner.execute([plugin], config);
 * // Result: ctx.files populated with ProcessedFile[]
 * ```
 *
 * @see {@link plugin-internals-slug} for slug generation algorithm
 * @see {@link plugin-internals-ignore} for .gitignore filtering
 */
export function discoverFiles(): SvartzPlugin {
  // ...
}
```

---

## See Also

- [[theme-contract]] — Companion contract for themes
- [[plugin-validation]] — Effect Schema validation internals
- [[plugin-utilities]] — Implementation of utility functions

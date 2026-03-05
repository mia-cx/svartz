# Authoring Themes

Complete contract for `@svartz/core` theme system. Defines the shape, validation, and factory pattern for Svartz themes.

## Overview

Themes are Svelte component packages that define layouts, routes, and optional plugin presets. Authored with `defineTheme` factory, themes include rich metadata about capabilities and artifact requirements.

## Core Types

### `SvartzTheme`

Main theme interface (author-facing, **Effect-free**).

```typescript
interface SvartzTheme {
  readonly id: string;
  readonly version: string;
  readonly contractVersion: string;
  
  // Required: layouts
  readonly layouts: ThemeLayoutMap;
  
  // Required: routes
  readonly routes: readonly ThemeRouteDefinition[];
  
  // Optional metadata
  readonly displayName?: string;
  readonly description?: string;
  
  // Optional functional sections
  readonly componentRegistry?: ThemeComponentRegistry;
  readonly artifactRequirements?: ThemeArtifactRequirements;
  readonly renderCapabilities?: ThemeRenderCapabilities;
  readonly pluginPreset?: ThemePluginPreset;
}
```

**Fields:**
- `id` — Unique theme identifier (e.g., `"@svartz/theme-minimal"`)
- `version` — Semver version of the theme (e.g., `"1.0.0"`)
- `contractVersion` — **Required** semver string matching `CONTRACT_VERSION` from core
  - Major version must match `CONTRACT_VERSION` (e.g., core `1.0.0` requires theme `1.x.x`)
  - Validation error on mismatch
- `layouts` — Map of layout components (see `ThemeLayoutMap`)
- `routes` — Array of route definitions (see `ThemeRouteDefinition`)
- All other fields optional but recommended

### `ThemeLayoutMap`

Mapping of layout names to Svelte component loaders.

```typescript
interface ThemeLayoutMap {
  readonly defaultPage: ThemeComponentLoader;
  readonly notePage: ThemeComponentLoader;
  readonly root?: ThemeComponentLoader;
  readonly tagPage?: ThemeComponentLoader;
  readonly folderPage?: ThemeComponentLoader;
  readonly notFoundPage?: ThemeComponentLoader;
  readonly [key: string]: ThemeComponentLoader | undefined;
}
```

**Required layouts:**
- `defaultPage` — Layout for index/root pages
- `notePage` — Layout for individual notes

**Optional layouts:**
- `root` — Wraps entire app
- `tagPage` — Tag listing page
- `folderPage` — Folder/directory page
- `notFoundPage` — 404 error page
- Custom layouts via extensible `[key: string]`

### `ThemeComponentLoader`

Canonical type for referencing Svelte components. Supports both sync and lazy-loaded forms.

```typescript
type ThemeComponentLoader =
  | (() => Promise<{ default: unknown }>)  // Dynamic import (lazy)
  | { readonly default: unknown };          // Sync import
```

**Usage:**

```typescript
// Sync import
import DefaultPage from "./layouts/DefaultPage.svelte";

const theme = {
  layouts: {
    defaultPage: { default: DefaultPage },
    notePage: { default: NotePage },
    // ...
  }
};

// Lazy import (dynamic)
const theme = {
  layouts: {
    defaultPage: () => import("./layouts/DefaultPage.svelte"),
    notePage: () => import("./layouts/NotePage.svelte"),
    // ...
  }
};
```

### `ThemeRouteDefinition`

Defines how files map to routes (used by SvelteKit).

```typescript
interface ThemeRouteDefinition {
  readonly id: string;
  readonly pattern: string;
  readonly layoutSlot?: string;
  readonly component?: ThemeComponentLoader;
  readonly prerender?: boolean;
  readonly priority?: number;
  readonly meta?: Record<string, unknown>;
}
```

**Required fields:**
- `id` — Unique route identifier (e.g., `"note"`, `"tag"`)
  - Special: `id: "note"` with `pattern` containing `:slug` is mandatory
- `pattern` — SvelteKit route pattern (e.g., `"/[...slug]"`, `"/tags/[tag]"`)

**Optional fields:**
- `layoutSlot` — Which layout from `layouts` to use (default: `"defaultPage"`)
- `component` — Custom page component (Svelte)
- `prerender` — Whether to prerender (default: true for blogs)
- `priority` — Sort order for route matching (higher = higher priority)
- `meta` — Custom metadata

**Validation requirement:**
- At least one route must have `id: "note"` and `pattern` containing `:slug`
  - Ensures every note gets a URL

### `ThemeComponentRegistry`

Optional map of theme-aware component overrides for markdown rendering.

```typescript
interface ThemeComponentRegistry {
  readonly callout?: ThemeComponentLoader;
  readonly backlinks?: ThemeComponentLoader;
  readonly graphPanel?: ThemeComponentLoader;
  readonly searchBox?: ThemeComponentLoader;
  readonly toc?: ThemeComponentLoader;
  readonly noteHeader?: ThemeComponentLoader;
  readonly [custom: string]: ThemeComponentLoader | undefined;
}
```

**Built-in components:**
- `callout` — Obsidian-style callout/admonition
- `backlinks` — List of references to this note
- `graphPanel` — Link graph visualization
- `searchBox` — Full-text search UI
- `toc` — Table of contents
- `noteHeader` — Title + metadata display

### `ThemeArtifactRequirements`

Declares which artifacts (metadata, graphs, indexes) the theme requires.

```typescript
interface ThemeArtifactRequirements {
  readonly index?: boolean;      // Search index + manifest
  readonly graph?: boolean;       // Link graph
  readonly backlinks?: boolean;   // Backlink reverse index
  readonly search?: boolean;      // Full-text search (derived from index)
  readonly toc?: boolean;         // Table of contents (derived from content)
  readonly custom?: readonly string[];
}
```

**Usage:**
The runner uses this to short-circuit artifact generation if a theme doesn't need it.

```typescript
const theme = {
  artifactRequirements: {
    index: true,      // Need for search + manifest
    graph: false,     // Don't need graph viz
    backlinks: false,
    custom: ["custom:analytics"]
  }
};
```

### `ThemeRenderCapabilities`

Declarative flags for rendering features the theme supports.

```typescript
interface ThemeRenderCapabilities {
  readonly callouts?: boolean;
  readonly wikilinks?: boolean;
  readonly embeds?: boolean;
  readonly codeBlocks?: boolean;
  readonly syntaxHighlighting?: boolean;
  readonly math?: boolean;
  readonly toc?: boolean;
  readonly backlinks?: boolean;
  readonly graph?: boolean;
  readonly search?: boolean;
}
```

**Informational only** — helps consumers (CLI, Vite plugin) decide which plugins to enable.

### `ThemePluginPreset`

Optional plugins bundled with the theme.

```typescript
interface ThemePluginPreset {
  readonly plugins: readonly SvartzPlugin[];
  readonly mode?: "replace" | "extend";
}
```

**Fields:**
- `plugins` — Array of plugins to merge using standard merge order
- `mode` — Always uses standard merge order regardless of value (no hidden behavior)

**Merge behavior:**
Plugins are merged as part of the standard 4-layer merge (core, theme, defaults, vault). Theme plugins go in layer 2; duplicate IDs replace earlier entries.

```typescript
const theme = {
  pluginPreset: {
    plugins: [
      {
        id: "theme:custom-highlight",
        transformContent: (ctx) => { /* custom syntax highlighting */ }
      }
    ]
  }
};
```

---

## `defineTheme` Factory

Main API for creating themes. Supports both static objects and configurable factories.

```typescript
// Static form
function defineTheme(theme: SvartzTheme): () => SvartzTheme;

// Factory form (with options)
function defineTheme<T extends Record<string, unknown>>(
  factory: (options?: T) => SvartzTheme
): (options?: T) => SvartzTheme;
```

**Returns:** Callable factory that validates on each invocation

### Static Form

```typescript
import { defineTheme } from "@svartz/core";
import DefaultPage from "./layouts/DefaultPage.svelte";
import NotePage from "./layouts/NotePage.svelte";

export default defineTheme({
  id: "@svartz/theme-minimal",
  version: "1.0.0",
  contractVersion: "1.0.0",
  layouts: {
    defaultPage: { default: DefaultPage },
    notePage: { default: NotePage }
  },
  routes: [
    {
      id: "note",
      pattern: "/[...slug]",
      layoutSlot: "notePage"
    }
  ],
  displayName: "Minimal Theme",
  description: "A minimal, fast theme for Obsidian-style vaults"
});
```

### Factory Form

```typescript
import { defineTheme, type SvartzTheme } from "@svartz/core";

export default defineTheme<{ colorScheme?: "light" | "dark" }>(
  (options = {}) => {
    const { colorScheme = "light" } = options;

    return {
      id: "@svartz/theme-configurable",
      version: "1.0.0",
      contractVersion: "1.0.0",
      layouts: {
        defaultPage: { default: DefaultPage },
        notePage: { default: NotePage }
      },
      routes: [ /* ... */ ],
      displayName: "Configurable Theme",
      // Use colorScheme in plugins or component registration
      pluginPreset: {
        plugins: [ /* color-aware plugins */ ]
      }
    };
  }
);
```

---

## Validation

### Validation Rules

`defineTheme` and `validateTheme` perform the following checks:

1. **`id` present** — Non-empty string
2. **`version` present** — Semver format (not validated strictly, just required)
3. **`contractVersion` present** — Semver format with **matching major version**
   - E.g., if `CONTRACT_VERSION = "1.0.0"`, theme must have `contractVersion: "1.x.x"`
   - Validation error if major mismatch
4. **Required layouts** — `defaultPage` and `notePage` must exist
5. **Required route** — At least one route with:
   - `id: "note"`
   - `pattern` containing `:slug`
6. **Unknown keys** — Warns via `console.warn` (non-fatal)

### Validation Errors

`ThemeValidationError` thrown on validation failure:

```typescript
interface ThemeValidationError extends Error {
  readonly _tag: "ThemeValidationError";
  readonly themeId: string;
  readonly message: string;
}
```

**Example:**
```typescript
import { defineTheme } from "@svartz/core";

try {
  const theme = defineTheme({
    id: "my:theme",
    version: "1.0.0",
    contractVersion: "2.0.0", // Major mismatch!
    layouts: { /* ... */ },
    routes: [ /* ... */ ]
  });
} catch (err) {
  if (err._tag === "ThemeValidationError") {
    console.error(`Theme ${err.themeId}: ${err.message}`);
  }
}
```

### Unknown Key Warnings

```typescript
const theme = defineTheme({
  id: "my:theme",
  version: "1.0.0",
  contractVersion: "1.0.0",
  layouts: { /* ... */ },
  routes: [ /* ... */ ],
  unknownField: true // ← warns: "[svartz:theme] theme 'my:theme' has unknown key 'unknownField'"
});
```

---

## JSDoc Examples

All theme utilities include JSDoc:

```typescript
/**
 * Create a theme with validation and factory pattern support.
 *
 * @template T - Configuration options type (if using factory form)
 *
 * @description
 * Accepts either a static theme object or a factory function that returns a theme.
 * Validates theme structure on each invocation:
 * - Required fields: id, version, contractVersion, layouts, routes
 * - contractVersion major must match CONTRACT_VERSION from core
 * - At least one route with id='note' and pattern containing ':slug'
 * - Unknown keys emit console.warn (non-fatal)
 *
 * @param themeOrFactory - Static theme object or factory function
 * @returns Callable factory that validates and returns theme
 *
 * @example
 * ```ts
 * // Static form
 * export default defineTheme({
 *   id: "@myorg/theme-simple",
 *   version: "1.0.0",
 *   contractVersion: "1.0.0",
 *   layouts: { defaultPage: { default: Default }, notePage: { default: Note } },
 *   routes: [{ id: "note", pattern: "/[...slug]" }]
 * });
 *
 * // Factory form (configurable)
 * export default defineTheme((opts = {}) => ({
 *   // ... theme fields, customized per opts
 * }));
 * ```
 *
 * @throws {@link ThemeValidationError} If validation fails
 *
 * @see {@link CONTRACT_VERSION} for current contract version
 * @see [[theme-validation]] for validation internals
 */
export function defineTheme<T extends Record<string, unknown> = Record<string, never>>(
  themeOrFactory: SvartzTheme | ((options?: T) => SvartzTheme)
): (options?: T) => SvartzTheme {
  // ...
}
```

---

## See Also

- [[plugin-contract]] — Companion contract for plugins
- [[theme-validation]] — Validation internals and Effect Schema
- [[theme-types]] — Internal type definitions

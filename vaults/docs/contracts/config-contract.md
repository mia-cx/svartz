# Config Contract & API

Complete reference for `@svartz/config` schema, types, and public API.

## Overview

`@svartz/config` owns the `svartz.config.ts` schema and resolution logic. Single source of truth for configuration across the entire Svartz system.

**Architecture:**
- Effect Schema (source of truth)
- Effect programs (internal, typed error handling)
- Promise-based public API (consumers don't need Effect)
- Exports both Promise APIs and Optional Effect programs

---

## Public API

### `loadConfig(path: string): Promise<SvartzConfig>`

Load and parse `svartz.config.ts` or `.mjs`.

```typescript
/**
 * Load Svartz configuration from file.
 *
 * @description
 * Reads and parses svartz.config.ts or svartz.config.mjs from given path.
 * Validates against schema and returns typed config object.
 *
 * Errors are wrapped in tagged error classes:
 * - ConfigLoadError — file not found, parse error
 * - ConfigValidationError — schema validation failed
 *
 * @param configPath - Absolute or relative path to config file
 * @returns Parsed, validated SvartzConfig
 *
 * @throws ConfigLoadError if file read/parse fails
 * @throws ConfigValidationError if validation fails
 *
 * @example
 * ```ts
 * import { loadConfig } from "@svartz/config";
 *
 * try {
 *   const config = await loadConfig("./svartz.config.ts");
 *   console.log(config.defaults.theme);
 * } catch (err) {
 *   if (err instanceof ConfigLoadError) {
 *     console.error("Failed to load config:", err.message);
 *   } else if (err instanceof ConfigValidationError) {
 *     console.error("Config validation failed:", err.details);
 *   }
 * }
 * ```
 */
export function loadConfig(path: string): Promise<SvartzConfig> {
  // Implementation in packages/config/src/loader.ts
}
```

---

### `resolveConfig(config: SvartzConfig): Promise<ResolvedSvartzConfig>`

Resolve defaults, paths, and produce final resolved config.

```typescript
/**
 * Resolve configuration (apply defaults, resolve paths).
 *
 * @description
 * Takes raw config and produces resolved config:
 * - Applies defaults from defaults layer
 * - Resolves relative paths to absolute
 * - Merges per-vault config with defaults
 * - Validates resolved structure
 *
 * @param config - Raw SvartzConfig
 * @returns ResolvedSvartzConfig with all paths resolved and defaults applied
 *
 * @throws ConfigResolutionError if resolution fails
 *
 * @example
 * ```ts
 * const config = await loadConfig("./svartz.config.ts");
 * const resolved = await resolveConfig(config);
 *
 * resolved.vaults.forEach(vault => {
 *   console.log(vault.path); // Absolute path
 * });
 * ```
 */
export function resolveConfig(
  config: SvartzConfig
): Promise<ResolvedSvartzConfig> {
  // Implementation in packages/config/src/resolver.ts
}
```

---

### `loadAndResolveConfig(path: string): Promise<ResolvedSvartzConfig>`

Convenience function: load + resolve in one call.

```typescript
/**
 * Load and resolve configuration in one step.
 *
 * @description
 * Calls loadConfig() and resolveConfig() sequentially.
 * Returns fully resolved config ready for use.
 *
 * @param path - Path to config file
 * @returns Resolved configuration
 *
 * @throws Same errors as loadConfig() or resolveConfig()
 *
 * @example
 * ```ts
 * const config = await loadAndResolveConfig("./svartz.config.ts");
 * const firstVault = config.vaults[0];
 * console.log(firstVault.path); // Absolute path
 * ```
 */
export function loadAndResolveConfig(
  path: string
): Promise<ResolvedSvartzConfig> {
  // Implementation
}
```

---

## Error Types

All errors are tagged and extend `Error`.

```typescript
/**
 * Thrown when config file cannot be loaded.
 *
 * @field _tag - Always "ConfigLoadError"
 * @field message - User-friendly error message
 * @field filePath - Path to config file that failed
 * @field cause - Underlying error (parse, read, etc.)
 *
 * @example
 * ```ts
 * try {
 *   await loadConfig("./svartz.config.ts");
 * } catch (err) {
 *   if (err instanceof ConfigLoadError) {
 *     console.error(`Failed to load ${err.filePath}: ${err.message}`);
 *   }
 * }
 * ```
 */
class ConfigLoadError extends Error {
  readonly _tag = "ConfigLoadError";
  readonly filePath: string;
  readonly cause: Error;
}

/**
 * Thrown when config validation fails.
 *
 * @field _tag - Always "ConfigValidationError"
 * @field message - Summary of validation errors
 * @field details - Array of detailed validation errors
 *
 * @example
 * ```ts
 * try {
 *   await loadConfig("./svartz.config.ts");
 * } catch (err) {
 *   if (err instanceof ConfigValidationError) {
 *     err.details.forEach(detail => {
 *       console.error(`${detail.field}: ${detail.message}`);
 *     });
 *   }
 * }
 * ```
 */
class ConfigValidationError extends Error {
  readonly _tag = "ConfigValidationError";
  readonly details: ValidationErrorDetail[];
}

/**
 * Thrown when config resolution fails.
 *
 * @field _tag - Always "ConfigResolutionError"
 * @field message - Description of resolution failure
 *
 * Examples:
 * - Circular vault references
 * - Missing referenced vaults
 * - Invalid theme paths
 */
class ConfigResolutionError extends Error {
  readonly _tag = "ConfigResolutionError";
}
```

---

## Core Types

All types are inferred from Effect Schema definitions. These are the canonical forms.

### `SvartzConfig`

Raw config as loaded from file.

```typescript
interface SvartzConfig {
  readonly version: string;
  readonly defaults?: SvartzDefaults;
  readonly vaults: Record<string, VaultConfig>;
  readonly plugins?: SvartzPlugin[];
  readonly themes?: Record<string, ThemeConfig>;
}
```

---

### `ResolvedSvartzConfig`

Fully resolved config with all defaults applied and paths normalized.

```typescript
interface ResolvedSvartzConfig {
  readonly version: string;
  readonly defaults: ResolvedSvartzDefaults;
  readonly vaults: ResolvedVaultConfig[];
  readonly plugins: SvartzPlugin[];
  readonly themes: ResolvedThemeConfig[];
}
```

---

### `SvartzDefaults`

Default settings applied to all vaults unless overridden.

```typescript
interface SvartzDefaults {
  readonly vault?: VaultConfig;
  readonly plugins?: SvartzPlugin[];
  readonly theme?: ThemeConfig;
}
```

**Fields:**
- `vault` — Default vault settings (paths, frontmatter fields, etc.)
- `plugins` — Default plugins applied to all vaults
- `theme` — Default theme

---

### `VaultConfig`

Configuration for a single vault.

```typescript
interface VaultConfig {
  readonly path: string;  // Relative to config file (resolved to absolute)
  readonly theme?: string | ThemeConfig;
  readonly include?: string[];  // Glob patterns
  readonly exclude?: string[];  // Glob patterns
  readonly frontmatterFields?: FrontmatterFieldsConfig;
  readonly plugins?: SvartzPlugin[];
  readonly target?: TargetConfig;
}
```

---

### `FrontmatterFieldsConfig`

Maps frontmatter YAML keys to roles.

```typescript
interface FrontmatterFieldsConfig {
  readonly titleField?: string;  // Which field has the note title (default: "title")
  readonly descriptionField?: string;  // Summary/preview field
  readonly tagsField?: string;  // Tag list field
  readonly aliasesField?: string;  // Alternative names
  readonly createdAtField?: string;  // Creation date
  readonly updatedAtField?: string;  // Last modified date
  readonly publishedField?: string;  // Publication status (default: "published")
}
```

**Draft inference:**
A file is considered "draft" if:
1. The `publishedField` is missing, OR
2. The `publishedField` is falsy (false, null, undefined, empty string)

There is no explicit `draftField`.

---

### `TargetConfig`

Output deployment target.

```typescript
type TargetConfig =
  | { type: "static"; outDir?: string; basePath?: string }
  | { type: "pages"; projectName: string; outDir?: string }
  | { type: "worker"; name: string; routes?: string[]; outDir?: string }
  | { type: "node"; outDir?: string };
```

**Types:**
- `static` — Static file output (default)
- `pages` — Cloudflare Pages
- `worker` — Cloudflare Workers
- `node` — Node.js server

---

### `ThemeConfig`

Theme reference and configuration.

```typescript
type ThemeConfig =
  | string  // Theme package name (e.g., "@svartz/theme-minimal")
  | {
      base: string;  // Theme package name
      tailwind?: TailwindThemeConfig;  // Tailwind customization
      [key: string]: any;  // Custom theme options
    };
```

---

## Schema Definitions

All schemas are defined in `packages/config/src/schemas/`. They're the source of truth for types.

**Key schemas:**
- `SvartzConfigSchema` — Entire config structure
- `VaultConfigSchema` — Single vault
- `FrontmatterFieldsSchema` — Frontmatter field mapping
- `TargetConfigSchema` — Deployment target
- `ThemeConfigSchema` — Theme config
- `TailwindThemeConfigSchema` — Tailwind customization (moved to `@svartz/core`)
- `WranglerConfigSchema` — Wrangler config (moved to `@svartz/core`)

---

## Configuration File Example

```typescript
// svartz.config.ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",

  defaults: {
    vault: {
      include: ["**/*.md"],
      exclude: ["node_modules/**", ".git/**"]
    },
    theme: "@svartz/theme-minimal",
    plugins: []
  },

  vaults: {
    docs: {
      path: "./docs",
      theme: "@svartz/theme-minimal",
      frontmatterFields: {
        titleField: "title",
        publishedField: "published"
      }
    },
    wiki: {
      path: "./wiki",
      theme: {
        base: "@svartz/theme-minimal",
        tailwind: {
          extend: {
            colors: { primary: "#0066cc" }
          }
        }
      }
    }
  }
});
```

---

## Integration with Other Packages

### `@svartz/plugins`

Uses resolved vault config:

```typescript
const plugin = discoverFiles();
// In runner:
runner.execute([plugin], resolvedConfig);
// Plugin accesses: ctx.vaultConfig.include, ctx.vaultConfig.exclude, etc.
```

---

### `@svartz/core`

Shares schema definitions (tailwind, wrangler):

```typescript
import {
  TailwindThemeConfigSchema,
  WranglerConfigSchema
} from "@svartz/core";
```

---

### Vite Plugin / CLI

Loads config to determine vaults and plugins:

```typescript
const config = await loadAndResolveConfig("./svartz.config.ts");
for (const vault of config.vaults) {
  await buildVault(vault);
}
```

---

## See Also

- [[contracts/plugin-contract]] — Plugin merge order in config
- [[contracts/theme-contract]] — Theme configuration options
- [[reference/quick-reference]] — Code examples

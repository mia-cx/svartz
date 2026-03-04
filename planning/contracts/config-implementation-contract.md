# Implementation Contract: @svartz/config

## Overview

Pure TypeScript package that owns the `svartz.config.ts` schema, validation, and resolution logic. Single source of truth for configuration across `@svartz/vault`, `@svartz/vite-plugin`, CLI, and `apps/web`.

Uses **Effect** internally for typed error handling and composable operations. Exposes **Promise-based public APIs** so consumers don't need Effect as a dependency. Optionally exports Effect programs for consumers who use Effect directly.

Uses **Effect Schema** for config validation and decode/encode boundaries (replaces Zod from the previous contract revision).

---

## Architecture

```
Consumer (CLI / Vite / apps/web)
        │
        ▼
  Promise-based public API   ← runEffect adapter (Effect.either → throw left)
        │
        ▼
  Effect programs (internal)  ← Effect.gen, typed errors, Schema decode
        │
        ▼
  Effect Schema definitions   ← Schema-first types, decode/encode, structured errors
```

Consumers call Promise-returning functions. Internally, all logic runs as Effect programs with typed error channels. The boundary adapter (same pattern as `@svartz/vault`) converts Effect results to Promise rejections using tagged error classes that extend `Error`.

---

## Package Structure

```
packages/config/
  src/
    index.ts              # Public API (Promise adapters + Effect exports)
    types.ts              # Tagged errors, data interfaces
    schema.ts             # Effect Schema definitions (source of truth for types)
    loader.ts             # loadConfig Effect program
    resolver.ts           # resolveConfigPaths Effect program
    utils/
      path-resolver.ts    # Resolve abs/relative paths
  tests/
    loader.test.ts
    schema.test.ts
    resolver.test.ts
    utils.test.ts
  tsconfig.json
  package.json
```

---

## Core Types

Types are derived from Effect Schema definitions. The schemas are the source of truth; TypeScript types are inferred using `Schema.Type<typeof ...>`.

```ts
// src/schema.ts
import { Schema } from "effect";

export const LinkResolutionStrategySchema = Schema.Literal("closest", "shallowest", "absolute");

export const TailwindThemeConfigSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

export const VaultThemeConfigSchema = Schema.Union(
  Schema.String,
  Schema.Struct({
    base: Schema.String,
  }).pipe(Schema.extend(TailwindThemeConfigSchema)),
);

export const TargetConfigSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("worker"), name: Schema.String, routes: Schema.optional(Schema.Array(Schema.String)), outDir: Schema.optional(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("pages"), projectName: Schema.String, outDir: Schema.optional(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("static"), outDir: Schema.optional(Schema.String), basePath: Schema.optional(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("node"), outDir: Schema.optional(Schema.String) }),
);

export const FrontmatterFieldsSchema = Schema.Struct({
  titleField: Schema.optional(Schema.String),
  descriptionField: Schema.optional(Schema.String),
  tagsField: Schema.optional(Schema.String),
  aliasesField: Schema.optional(Schema.String),
  createdAtField: Schema.optional(Schema.String),
  updatedAtField: Schema.optional(Schema.String),
  publishedField: Schema.optional(Schema.String),
});

// Draft status is inferred: a note is draft if the publishedField is missing or falsy.
// There is no explicit draftField.

export const SvartzDefaultsSchema = Schema.Struct({
  vault: Schema.optional(Schema.Struct({
    include: Schema.optional(Schema.Array(Schema.String)),
    exclude: Schema.optional(Schema.Array(Schema.String)),
    linkResolution: Schema.optional(LinkResolutionStrategySchema),
    theme: Schema.optional(VaultThemeConfigSchema),
    frontmatter: Schema.optional(FrontmatterFieldsSchema),
  })),
  build: Schema.optional(Schema.Struct({
    concurrency: Schema.optional(Schema.Number),
    maxRetries: Schema.optional(Schema.Number),
  })),
});

export const VaultConfigSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  rootPath: Schema.optional(Schema.String),
  target: TargetConfigSchema,
});

export const SemverSchema = Schema.String.pipe(
  Schema.pattern(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),
);

export const SvartzConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  version: SemverSchema,
  workspace: Schema.optional(Schema.Struct({
    rootDir: Schema.optional(Schema.String),
  })),
  defaults: Schema.optional(SvartzDefaultsSchema),
  vaults: Schema.Array(VaultConfigSchema),
});
```

Inferred TypeScript types:

```ts
// src/types.ts (derived from schema)
import type { Schema } from "effect";
import type {
  SvartzConfigSchema,
  VaultConfigSchema,
  SvartzDefaultsSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  LinkResolutionStrategySchema,
} from "./schema.js";

export type SvartzConfig = Schema.Type<typeof SvartzConfigSchema>;
export type VaultConfig = Schema.Type<typeof VaultConfigSchema>;
export type SvartzDefaults = Schema.Type<typeof SvartzDefaultsSchema>;
export type VaultThemeConfig = Schema.Type<typeof VaultThemeConfigSchema>;
export type TargetConfig = Schema.Type<typeof TargetConfigSchema>;
export type LinkResolutionStrategy = Schema.Type<typeof LinkResolutionStrategySchema>;
```

---

## Tagged Errors (ADT)

All errors use `Data.TaggedError` (same pattern as `@svartz/vault`). Each error is its own class, extending `Error`, with a discriminant `_tag` field.

```ts
// src/types.ts
import { Data } from "effect";

export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly searchPath: string;
  readonly message: string;
}> {}

export class ConfigImportFailed extends Data.TaggedError("ConfigImportFailed")<{
  readonly path: string;
  readonly message: string;
}> {}

export class ConfigDecodeFailed extends Data.TaggedError("ConfigDecodeFailed")<{
  readonly issues: ReadonlyArray<unknown>;
  readonly message: string;
}> {}

export class VaultPathInvalid extends Data.TaggedError("VaultPathInvalid")<{
  readonly vaultId: string;
  readonly path: string;
  readonly message: string;
}> {}

export class VaultIdNotFound extends Data.TaggedError("VaultIdNotFound")<{
  readonly vaultId: string;
  readonly message: string;
}> {}

export type ConfigError =
  | ConfigNotFound
  | ConfigImportFailed
  | ConfigDecodeFailed
  | VaultPathInvalid
  | VaultIdNotFound;
```

Note: `THEME_NOT_FOUND` is intentionally absent from the config package. Theme resolution is consumer-owned (CLI, Vite plugin). Consumers define their own `ThemeNotFound` error when resolving theme packages/paths.

---

## Core Functions

All functions are Effect programs internally, with Promise adapters exported for consumers.

### `loadConfig`

```ts
// Effect program (internal)
// Returns both the decoded config and the directory containing the config file (project root).
export const loadConfigEffect = (
  configPath?: string,
): Effect.Effect<
  { config: SvartzConfig; configDir: string },
  ConfigNotFound | ConfigImportFailed | ConfigDecodeFailed
> =>
  Effect.gen(function* () {
    const resolvedPath = configPath
      ? yield* resolveExplicitPath(configPath)
      : yield* searchUpward(process.cwd());

    const raw = yield* importConfig(resolvedPath);
    const config = yield* decodeConfig(raw);
    return { config, configDir: dirname(resolvedPath) };
  });

// Promise adapter (public)
export const loadConfig = (
  configPath?: string,
): Promise<{ config: SvartzConfig; configDir: string }> =>
  runEffect(loadConfigEffect(configPath));
```

**Behavior:**
- If `configPath` provided: resolve and load directly.
- If omitted: search parent dirs from cwd for `svartz.config.ts` (or `.js`, `.mjs` variants).
- Loads config files using appropriate mechanism for the runtime (Node.js `require`/`import`, Deno, etc.). SvelteKit apps and Vite plugins can use `import()` for `.ts` or `.js` files in dev/SSR contexts.
- Supported file formats: `svartz.config.ts`, `svartz.config.js`, `svartz.config.mjs` (no JSON — requires typing).
- Decodes the raw import against `SvartzConfigSchema`. On decode failure, surfaces structured issues in `ConfigDecodeFailed.issues`.
- Respects `SVARTZ_CONFIG` environment variable to override search path.

### `decodeConfig`

```ts
export const decodeConfig = (
  raw: unknown,
): Effect.Effect<SvartzConfig, ConfigDecodeFailed> =>
  Schema.decode(SvartzConfigSchema)(raw).pipe(
    Effect.mapError((parseError) =>
      new ConfigDecodeFailed({
        issues: parseError.issues,
        message: `Config validation failed: ${parseError.message}`,
      }),
    ),
  );
```

**Behavior:**
- Decodes raw JavaScript object against Effect Schema.
- Returns structured decode issues (not `string[]`).
- Accepts both `theme: "string"` and `theme: { base, ...overrides }` via the union schema.

### `resolveConfigPaths`

```ts
export const resolveConfigPathsEffect = (
  config: SvartzConfig,
  configDir: string,
): Effect.Effect<ResolvedSvartzConfig, VaultPathInvalid> =>
  Effect.gen(function* () {
    const rootDir = config.workspace?.rootDir
      ? resolve(configDir, config.workspace.rootDir)
      : configDir;

    const vaults = yield* Effect.forEach(
      config.vaults,
      (vault) => resolveVault(vault, config.defaults, rootDir),
      { concurrency: 1 },
    );

    return {
      workspace: { rootDir },
      defaults: resolveDefaults(config.defaults),
      vaults,
    };
  });

// Promise adapter
export const resolveConfigPaths = (
  config: SvartzConfig,
  configDir: string,
): Promise<ResolvedSvartzConfig> =>
  runEffect(resolveConfigPathsEffect(config, configDir));
```

**Output type:**

```ts
export interface ResolvedSvartzConfig {
  workspace: { rootDir: string };
  defaults: Required<SvartzDefaults>;
  vaults: ResolvedVaultConfig[];
}

export interface ResolvedVaultConfig {
  id: string;
  path: string;    // absolute
  include: string[];
  exclude: string[];
  linkResolution: LinkResolutionStrategy;
  theme: {
    base: string;  // npm package or local path
    config: TailwindThemeConfig; // normalized overrides (empty object when omitted)
  };
  frontmatter: {
    titleField: string;
    descriptionField: string;
    tagsField: string;
    aliasesField: string;
    createdAtField: string;
    updatedAtField: string;
    publishedField: string;
  };
  rootPath: string;
  target: TargetConfig;
}
```

**Merge rules:**
- `include`: per-vault > defaults > `["**/*.md", "**/*.(jpg|webp|png|avif)"]`
- `exclude`: per-vault > defaults > `[]`
- `linkResolution`: per-vault > defaults > `"closest"`
- `frontmatter.titleField`: per-vault > defaults > `"title"`
- `frontmatter.descriptionField`: per-vault > defaults > `"description"`
- `frontmatter.tagsField`: per-vault > defaults > `"tags"`
- `frontmatter.aliasesField`: per-vault > defaults > `"aliases"`
- `frontmatter.createdAtField`: per-vault > defaults > `"created_at"`
- `frontmatter.updatedAtField`: per-vault > defaults > `"updated_at"`
- `frontmatter.publishedField`: per-vault > defaults > `"published"` (absence or falsy → draft)
- `theme.base`: per-vault > defaults > `"@svartz/theme-minimal"` (hardcoded fallback; always defined)
- `theme.config`: defaults overrides > per-vault overrides (merged)
- `theme` shape: accept string or object via union; normalize `theme: "string"` → `{ base: "string", config: {} }`
- `rootPath`: per-vault > `"/"`
- `concurrency` (in build defaults): defaults > `10`
- `maxRetries` (in build defaults): defaults > `3`

**Vault path resolution:**
- Resolve `vaults[].path` relative to `workspace.rootDir`.
- Verify each vault path exists and is a directory.
- Fail with `VaultPathInvalid` if missing.

**Config version check:**
- `version` is a semver string (e.g., `"1.0.0"`, `"1.2.3-beta.1"`). Parse the major version from the string.
- Check that the parsed major version matches `SUPPORTED_MAJOR_VERSION` (currently `1`).
- If major version differs, fail with `ConfigDecodeFailed` (incompatible config version).
- Minor/patch/pre-release versions are forward/backward compatible — only major matters.

### `getVault`

```ts
export const getVaultEffect = (
  config: ResolvedSvartzConfig,
  vaultId: string,
): Effect.Effect<ResolvedVaultConfig, VaultIdNotFound> =>
  Effect.gen(function* () {
    const vault = config.vaults.find((v) => v.id === vaultId);
    if (!vault) {
      return yield* new VaultIdNotFound({
        vaultId,
        message: `Vault "${vaultId}" not found in config`,
      });
    }
    return vault;
  });

// Promise adapter
export const getVault = (
  config: ResolvedSvartzConfig,
  vaultId: string,
): Promise<ResolvedVaultConfig> =>
  runEffect(getVaultEffect(config, vaultId));
```

### `listVaults` (pure, no Effect needed)

```ts
export const listVaults = (config: ResolvedSvartzConfig): VaultSummary[] =>
  config.vaults.map((v) => ({
    id: v.id,
    path: v.path,
    themeBase: v.theme.base,
    target: v.target,
  }));

export interface VaultSummary {
  id: string;
  path: string;
  themeBase: string;
  target: TargetConfig;
}
```

### `defineConfig` (pure helper for IDE support)

```ts
export const defineConfig = (config: SvartzConfig): SvartzConfig => config;
```

---

## Boundary Adapter Pattern

Same pattern as `@svartz/vault`:

```ts
// src/index.ts
import { Effect, Either } from "effect";

const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });
```

This ensures consumers get tagged errors (which extend `Error`) thrown directly — no `FiberFailure` wrapping. Consumers can use `instanceof` checks:

```ts
try {
  const config = await loadConfig();
} catch (e) {
  if (e instanceof ConfigNotFound) {
    console.error(`Config not found: ${e.searchPath}`);
  }
  if (e instanceof ConfigDecodeFailed) {
    console.error(`Validation issues:`, e.issues);
  }
}
```

---

## Public API

```ts
// Types (inferred from Schema)
export type {
  SvartzConfig,
  SvartzDefaults,
  VaultConfig,
  VaultThemeConfig,
  TargetConfig,
  LinkResolutionStrategy,
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  VaultSummary,
  ConfigError,
};

// Tagged error classes
export {
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
  VaultPathInvalid,
  VaultIdNotFound,
};

// Schemas (for consumers who want to extend or compose)
export {
  SvartzConfigSchema,
  VaultConfigSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
};

// Promise-based public API
export {
  loadConfig,
  decodeConfig,
  resolveConfigPaths,
  getVault,
  listVaults,
  defineConfig,
};

// Effect programs (for consumers who use Effect directly)
export {
  loadConfigEffect,
  decodeConfigEffect,
  resolveConfigPathsEffect,
  getVaultEffect,
};

// Boundary adapter (same as @svartz/vault)
export { runEffect };
```

---

## CLI Integration Pattern

```ts
import {
  loadConfig,
  resolveConfigPaths,
  getVault,
  ConfigNotFound,
  ConfigDecodeFailed,
  VaultIdNotFound,
} from "@svartz/config";

program
  .command("index <vault-id>")
  .option("--config <path>", "Path to svartz.config.ts")
  .action(async (vaultId, opts) => {
    try {
      const { config, configDir } = await loadConfig(opts.config);
      const resolved = await resolveConfigPaths(config, configDir);
      const vault = await getVault(resolved, vaultId);

      const files = await traverseVault(vault.path, {
        include: vault.include,
        exclude: vault.exclude,
      });
      const index = await buildIndex(files, {
        vaultPath: vault.path,
        linkResolution: vault.linkResolution,
      });
    } catch (err) {
      if (err instanceof ConfigNotFound) {
        console.error(`✗ ${err.message}`);
      } else if (err instanceof ConfigDecodeFailed) {
        console.error(`✗ Config invalid:`, err.issues);
      } else if (err instanceof VaultIdNotFound) {
        console.error(`✗ ${err.message}`);
      } else {
        throw err;
      }
    }
  });
```

---

## Vite Plugin Integration Pattern

```ts
import { loadConfig, resolveConfigPaths, getVault } from "@svartz/config";

export default function svartzPlugin(options?: { vaultId?: string; configPath?: string }) {
  return {
    name: "svartz",
    async configResolved(viteConfig) {
      const { config, configDir } = await loadConfig(options?.configPath);
      const resolved = await resolveConfigPaths(config, configDir);
      const vaultId = options?.vaultId || resolved.vaults[0]!.id;
      const vault = await getVault(resolved, vaultId);

      this.config.define ||= {};
      this.config.define.__VAULT_PATH__ = JSON.stringify(vault.path);
      this.config.define.__VAULT_INCLUDE__ = JSON.stringify(vault.include);
      this.config.define.__VAULT_EXCLUDE__ = JSON.stringify(vault.exclude);
      this.config.define.__ROOT_PATH__ = JSON.stringify(vault.rootPath);
    },
  };
}
```

---

## Build & Distribution

- **Build tool:** `tsup` (same as `@svartz/vault`)
- **Output formats:** ESM only
- **Publish:** `@svartz/config` on npm
- **Dependencies:** `effect` (runtime — schema, errors, effects)
- **Dev dependencies:** `typescript`, `vitest`, `tsup`
- **No other runtime dependencies** beyond `effect`

---

## Tests

### `tests/schema.test.ts`

- Valid full config decodes successfully
- Valid minimal config (only required fields) decodes
- Missing required fields produce `ConfigDecodeFailed` with structured issues
- Invalid `TargetConfig` types produce decode errors
- Invalid `LinkResolutionStrategy` produces decode errors
- Legacy `theme: "string"` and `theme: { base, ...overrides }` both decode

### `tests/loader.test.ts`

- Load valid config from disk (fixtures or mock)
- Search for `svartz.config.ts` in parent dirs
- `ConfigNotFound` on missing config
- `ConfigImportFailed` on syntax errors
- `ConfigDecodeFailed` on schema mismatch

### `tests/resolver.test.ts`

- Relative vault paths resolve to absolute (with configDir)
- Defaults merge correctly (per-vault > global default > hardcoded)
- Theme normalization: `theme: "string"` → `{ base: string, config: {} }`
- Theme merge: defaults.theme overrides applied before vault overrides
- `VaultPathInvalid` on non-existent vault path
- `getVault()` returns correct vault or fails with `VaultIdNotFound`
- `listVaults()` returns all vaults with resolved theme base

### `tests/utils.test.ts`

- Glob patterns normalized to forward slashes
- Path resolution edge cases (trailing slashes, relative `../`, etc.)

### Run Tests

```bash
pnpm --filter @svartz/config test
```

---

## Example Config

```ts
// svartz.config.ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  workspace: {
    rootDir: ".",
  },
  defaults: {
    vault: {
      include: ["**/*.md"],
      exclude: ["archive/**", ".draft/**"],
      linkResolution: "closest",
      theme: {
        base: "@svartz/theme-minimal",
        colors: {
          brand: "oklch(0.62 0.19 264)",
          accent: "oklch(0.78 0.12 180)",
        },
      },
    },
    build: {
      concurrency: 10,
    },
  },
  vaults: [
    {
      id: "docs",
      path: "vaults/docs",
      theme: {
        base: "@svartz/theme-minimal",
        colors: {
          accent: "oklch(0.74 0.16 190)",
        },
      },
      rootPath: "/docs",
      target: {
        type: "pages",
        projectName: "svartz-docs",
      },
    },
    {
      id: "wiki",
      path: "vaults/wiki",
      include: ["**/*.md"],
      exclude: ["private/**"],
      rootPath: "/",
      target: {
        type: "worker",
        name: "wiki",
        outDir: "dist/wiki",
      },
    },
  ],
});
```

---

## Ownership Boundaries

- **Config package owns:** schema definition, validation (decode), path resolution, defaults merging, vault lookup.
- **Config package does NOT own:** theme module resolution (loading npm/local themes), theme component inspection, or theme installation. These are consumer responsibilities (CLI, Vite plugin).
- **Project root:** The directory containing `svartz.config.ts` is the project root. Consumers (CLI, Vite plugin) should set working directory to config directory before processing vaults.
- **Vault CLI consumer pattern:** `@svartz/vault` `index [vault-ref]` / `--vault <id>` follows the CLI integration pattern when config loads, and falls back to path mode when config is unavailable.
- **Theme resolution helpers:** may be added as optional shared utilities in a future iteration; not part of this contract. See `planning/theme-resolution-npm-local-absolute.md` for the consumer-side resolution algorithm. GitHub issue: [#9](https://github.com/mia-cx/svartz/issues/9).

---

## Notes

- **Effect alignment:** This package follows the same Effect patterns established in `@svartz/vault` — tagged errors via `Data.TaggedError`, Effect programs with Promise adapters using `runEffect`, and `Effect.gen` for composition. Both Effect programs and Promise adapters are exported for maximum flexibility.
- **Schema-first:** Effect Schema is the source of truth for config shape. TypeScript types are inferred from schemas, not the other way around. This ensures validation and types never drift.
- **Default theme fallback:** `@svartz/theme-minimal` is a required dependency of Svartz and serves as the hardcoded fallback if no theme is specified at any level. Every `ResolvedVaultConfig.theme.base` is always defined.
- **Frontmatter defaults:** Hardcoded field names are title, description, tags, aliases, created_at, updated_at, published. Draft status is inferred: a note is draft if the `published` field is absent or falsy.
- **Config version semver:** `version` is a semver string (e.g., `"1.0.0"`). Only the major version is checked — config `version: "1.5.3"` works with config package supporting major `1`. Minor/patch/pre-release versions are forward/backward compatible.
- **Env var override:** `SVARTZ_CONFIG` environment variable overrides config path search.
- **Hot reload:** Config changes during `svartz dev` should trigger a rebuild (handled by dev server, not this package).

# Runtime Vite Integration

How Svartz bridges a single resolved vault build into SvelteKit with `@svartz/vite`.

## Overview

`@svartz/vite` is not a route generator for `apps/web`. Instead, it:

- accepts one CLI-resolved `ResolvedConfig`
- runs the Svartz pipeline for that vault
- materializes vault-scoped runtime artifacts
- exposes those artifacts through virtual modules
- lets static SvelteKit routes continue to live in `apps/web`

This keeps multi-vault builds isolated while preserving normal SvelteKit route precedence.

## Config Handoff

The CLI owns config discovery and resolution.

- Input to the CLI: `SvartzConfig`
- Input to `@svartz/vite`: one `ResolvedConfig`

`ResolvedConfig.outDir` is the final bundle output path and defaults to:

```text
.svartz/vaults/<vaultId>/dist
```

`@svartz/vite` derives the generated runtime root from `outDir`, so the artifact root becomes:

```text
.svartz/vaults/<vaultId>/artifacts
```

## Runtime Plugin Merge

At runtime, the Vite plugin merges plugins in this order:

1. core plugins
2. theme plugin preset
3. config defaults plugins
4. config vault plugins

Duplicate plugin ids replace less-specific layers in place. Unique ids append.

## Generated Artifact Layout

`core:emit-artifacts` writes the runtime input set for the active vault:

```text
.svartz/vaults/<vaultId>/artifacts/
├── index.ts
└── pages/
    └── **/*.svelte
```

### `index.ts`

Eager shared runtime data:

- `index`
- `graph`
- `backlinks`
- `search`

### `pages/**/*.svelte`

One compiled note page artifact per slug, addressed by keys like:

- `pages/index.svelte`
- `pages/guides/intro.svelte`

`core:emit-artifacts` itself is a final `post` hook, but its disk writer fans out internally in parallel with Effect.

## Virtual Modules

### `virtual:svartz/theme`

Theme-owned runtime surface:

- `theme`
- `routes`
- `resolveRuntimeRoute({ pathname, slug? })`
- `resolveRouteToArtifactKey({ pathname, slug? })`

This module re-exports the validated theme package and uses core route-matcher helpers.

### `virtual:svartz/artifacts`

Artifact bridge surface:

- `artifacts`
- `loadNoteArtifact(key)`
- `index`
- `graph`
- `backlinks`
- `search`

This keeps note pages lazy while keeping global layout data eager.

## Apps Web Route Shells

`apps/web` keeps static routes under source control.

- `src/routes/+page.svelte` is the root runtime shell
- `src/routes/[...slug]/+page.svelte` is the catch-all runtime shell
- other static routes still override the catch-all through normal SvelteKit matching

The shared shell component:

- resolves the current route through `virtual:svartz/theme`
- chooses the theme layout via `layoutSlot`
- loads the note page via `virtual:svartz/artifacts`
- passes `theme`, `route`, `match`, `entry`, `index`, `graph`, `backlinks`, and `search`

## Testing

`apps/web` browser tests should not wire the real Svartz Vite plugin into the app config.

Instead:

- keep local ambient declarations for Svartz virtual modules in `apps/web/src/**.d.ts`
- provide test-only virtual module stubs from `apps/web/vite.config.ts`
- avoid adding `@svartz/vite` as a direct `apps/web` dependency just to get types

This avoids pulling an extra Vite type graph into the app while still exercising the runtime shell.

## See Also

- [[contracts/plugin-contract]]
- [[contracts/theme-contract]]
- [[plugins/emit-artifacts]]

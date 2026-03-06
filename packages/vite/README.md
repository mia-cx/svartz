# @svartz/vite

`@svartz/vite` is the runtime-driven Vite integration layer for Svartz.

It consumes a pre-resolved single-vault `ResolvedConfig`, runs the Svartz plugin pipeline, exposes runtime virtual modules, and bridges generated artifacts into SvelteKit without generating route files into `apps/web`.

## What It Does

- Accepts a CLI-resolved `ResolvedConfig` for exactly one vault.
- Loads and validates the configured Svartz theme.
- Merges runtime plugins in specificity order:
  1. core plugins
  2. theme plugin preset
  3. config defaults plugins
  4. config vault plugins
- Runs the Svartz pipeline inside Vite before module loading.
- Emits vault-scoped artifacts under `.svartz/vaults/<vaultId>/artifacts`.
- Exposes `virtual:svartz/theme` and `virtual:svartz/artifacts` for `apps/web`.

## Usage

```ts
import { svartz } from "@svartz/vite";
import type { ResolvedConfig } from "@svartz/core";

export function createSvartzVitePlugin(config: ResolvedConfig) {
  return svartz({
    config,
    mode: "production",
    env: {},
  });
}
```

`@svartz/vite` is intended to be injected by the Svartz CLI orchestration layer, not hard-coded into `apps/web/vite.config.ts`.

## Generated Output

Given `ResolvedConfig.outDir = .svartz/vaults/docs/dist`, the plugin writes runtime inputs to:

```text
.svartz/vaults/docs/artifacts/
├── index.ts
└── pages/
    └── **/*.svelte
```

- `index.ts` eagerly exports `index`, `graph`, `backlinks`, and `search`.
- `pages/**/*.svelte` contains one compiled page artifact per note slug.
- The final Vite/SvelteKit bundle still goes to `ResolvedConfig.outDir`.

## Virtual Modules

### `virtual:svartz/theme`

Exports the validated theme surface and runtime route helpers:

- `theme`
- `routes`
- `resolveRuntimeRoute({ pathname, slug? })`
- `resolveRouteToArtifactKey({ pathname, slug? })`

This module re-exports from the real theme package rather than serializing loaders.

### `virtual:svartz/artifacts`

Exports the generated artifact bridge:

- `artifacts`
- `loadNoteArtifact(key)`
- `index`
- `graph`
- `backlinks`
- `search`

This module eagerly imports `index.ts` and lazily imports note page artifacts by key.

## Route Shell Model

`apps/web` owns static route files. Svartz does not generate SvelteKit route files into the app.

- `src/routes/+page.svelte` and `src/routes/[...slug]/+page.svelte` act as runtime shells.
- Static SvelteKit routes in `apps/web/src/routes` still win over the catch-all route.
- Theme layouts are resolved from `virtual:svartz/theme`.
- Note components are loaded from `virtual:svartz/artifacts`.

## Notes

- `core:emit-artifacts` runs as a final `post` emitter hook.
- The emitter itself writes files in parallel internally using Effect.
- `apps/web` should use local ambient declarations for Svartz virtual modules and local test stubs for browser tests; it should not depend on `@svartz/vite` just for types.

# `@svartz/vite`

The Vite plugin runs one resolved vault through `@svartz/plugins` and writes its runtime artifacts under `.svartz/vaults/<id>/artifacts`. The CLI composes several vault plugins into one existing SvelteKit host build, or uses the repository's static `apps/web` shell. A host keeps its routes, layouts, adapter, scripts, and `.svelte-kit` directory.

The CLI injects `svartz()` during build and dev. A host with Svartz virtual imports also wraps its Vite export so SvelteKit's secondary build sees the same aliases:

```ts
import { withSvartzHost } from '@svartz/vite/host';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default withSvartzHost(defineConfig({ plugins: [sveltekit()] }));
```

`svartz init` adds that wrapper without replacing the host's Vite expression. A manual SvelteKit route wins over a vault URL at the same path.

## Runtime modules

- `virtual:svartz/artifacts` exposes the generated note components, published index, route data, and browser resources for one vault.
- `mountBrowserResources(pathname)` mounts a vault's browser scripts and returns a disposer. The disposer calls every script cleanup, then reports any errors.
- `virtual:svartz/theme` exposes the theme, its route matcher, and a `ready` promise that loads lazy components.
- `virtual:svartz/host` exposes each host vault's published metadata, combined routes, `resolveHostVault(pathname)`, and `prepareHostVault(pathname)`. The latter loads only the selected vault's runtime code.

The generated catchall awaits `prepareHostVault` in universal `load` before rendering. A custom route that renders `SvartzRuntimePage` must do the same, after removing SvelteKit's deployment base from the pathname. The helper avoids top-level await in the generated theme module, which can stall SSR chunk rendering when a lazy page imports a shared package. See [`@svartz/ui`](../ui/README.md) for a working route example.

The plugin re-runs the pipeline and triggers a full browser reload for vault edits. The CLI restarts dev for config, theme, or workspace-package source changes. Generated assets stay inside each vault's mount path; SvelteKit's adapter owns the host output.

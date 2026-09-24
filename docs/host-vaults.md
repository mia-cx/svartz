# Multiple vaults in one SvelteKit host

Place vaults in the host's `svartz.config.ts` with separate `mountPath` values. The host keeps its own SvelteKit routes and adapter.

Svartz also loads `.mjs` and `.js` config files. Calls to `loadConfig` in the same process pick up edits to `.mjs`, ESM `.js`, and `.ts` files. An ESM `.js` config follows its nearest `package.json` with `"type": "module"`.

```ts
import { defineConfig } from '@svartz/config';

export default defineConfig({
  version: '1.0.0',
  vaults: [
    { id: 'journal', path: './content/journal', mountPath: '/journal', target: { type: 'host' } },
    { id: 'work', path: './content/work', mountPath: '/work', target: { type: 'host' } }
  ]
});
```

`svartz build` composes every host vault into one SvelteKit build. `svartz dev` serves them in one process. `--vault <id>` still validates the named vault, but a host build includes all configured vaults because they share one output. `npx svartz init` adds the Svartz catchall if the app has none. It preserves an existing catchall and all manual routes. A manual route such as `src/routes/journal/about/+page.svelte` takes priority over the vault page at that URL.

Each vault gets its own theme, publication filter, generated artifacts, and asset URL namespace. A file named `image.png` in both vaults is served at `/journal/image.png` and `/work/image.png`. Overlapping mounts, including `/` beside `/journal`, fail config loading. Output roots must also stay separate, even when an existing or dangling symlink makes two configured paths point to the same directory. Filesystem failures while checking those roots return a tagged `VaultBuildRootResolutionFailed` error.

The generated `virtual:svartz/host` module exposes `vaults`, combined `routes`, `resolveHostVault(pathname)`, and `prepareHostVault(pathname)`. `vaults` holds each mount's published index and site settings for route lookup and opt-in discovery. Runtime artifacts and theme code load only when `prepareHostVault` selects that mount. The default catchall uses `routes` for redirects and 404s, then awaits `prepareHostVault` before rendering. If a custom route renders `SvartzRuntimePage`, call `prepareHostVault` in its universal `load` too, using the pathname after removing SvelteKit's deployment base. This prepares lazy theme components for both server rendering and client hydration. Hosts can import `virtual:svartz/artifacts` for a single-vault build or use the registry to select a vault in a composed build. See the [published vault view](vault-view.md) for typed note data.

During `svartz dev`, edits to a local workspace theme rebuild that theme package before the host restarts. This keeps package exports pointing at `dist` in sync with source edits.

Each vault can emit its own RSS feed and sitemap. A host can also select vaults for a combined feed or sitemap in a manual SvelteKit route. See [feeds and sitemaps](discovery.md).

When the CLI builds one local workspace theme, its source manifest supplies build plugins and its source path overrides the packaged theme in both SvelteKit build phases. Published themes use their runtime package entry.

An existing host can use `vite.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs`. During `svartz dev`, edits to local files imported by that config restart the host runner. Explicit directory themes may use package exports without a root `index.js`; the built-in theme resolves from Svartz's installation.

# `svartz`

`svartz` is the orchestration CLI for building and serving one resolved vault at a time through `apps/web`.

It loads `svartz.config.ts`, resolves the selected vault, injects `@svartz/vite` into the app build, and prepares a vault-scoped workspace under `.svartz/vaults/<vaultId>/`.

## Commands

```sh
svartz build
svartz build --vault docs
svartz build:all
svartz dev --vault docs
```

`svartz build` now builds every configured vault sequentially.

Use `svartz build --vault <id>` when you want to target a single vault.

## Turbo task sync

After the CLI resolves `svartz.config.ts`, it syncs a managed Turbo/package surface at the config root:

- `package.json` scripts: `svartz:build`, `svartz:build:<vault-id>`, `svartz:dev:<vault-id>`, `svartz:preview:<vault-id>`, plus `svartz:dev`/`svartz:preview` fan-out scripts.
- `turbo.json` tasks: `//#svartz:build`, `//#svartz:build:<vault-id>`, `//#svartz:dev:<vault-id>`, and `//#svartz:preview:<vault-id>`.

The CLI only rewrites those managed `svartz:*` / `//#svartz:*` entries, so existing non-Svartz scripts and Turbo tasks stay untouched.

## Per-Vault Workspace Contract

For a vault like `docs`, the CLI now prepares:

```text
.svartz/vaults/docs/
├── .svelte-kit/   # SvelteKit internal dev/build state for this vault only
├── artifacts/     # generated Svartz runtime modules and page artifacts
├── dist/          # final adapter output for static builds
└── node_modules   # symlink to apps/web/node_modules for isolated prerender output
```

This keeps parallel or repeated vault builds from sharing a single `apps/web/.svelte-kit` directory while still letting SvelteKit's prerender server resolve package dependencies.

## Build Env Passed To `apps/web`

The CLI derives and sets:

- `SVARTZ_OUT_DIR`
- `SVARTZ_KIT_OUT_DIR`
- `SVARTZ_BASE_PATH`
- `SVARTZ_TARGET_TYPE`
- `SVARTZ_THEME_MODULE_PATH`
- `SVARTZ_ARTIFACTS_MODULE_PATH`

For provider-style targets that rely on `adapter-auto`, the CLI also sets the matching platform environment variables for the selected vault before invoking Vite.

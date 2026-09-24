# `svartz`

`svartz` builds and serves configured vaults through SvelteKit. It uses an existing SvelteKit app at the config root, or the repository's `apps/web` shell.

It loads `svartz.config.ts`, resolves the selected vault, injects `@svartz/vite` into the app build, and prepares a vault-scoped workspace under `.svartz/vaults/<vaultId>/`.

## Commands

```sh
svartz init
svartz build
svartz build --vault docs
svartz build:all
svartz dev --vault docs
```

`svartz build` now builds every configured vault sequentially.

`npx svartz@latest init` initializes the directory where it runs. A new project gets an editable SvelteKit shell, a `vault/index.md` starter note, the minimal theme dependency, and `svartz.config.ts`. It installs with npm unless an existing package manager is declared. It initializes Git for a new standalone project unless already inside a Git worktree. `--no-install` and `--no-git` skip those steps.

In an existing SvelteKit app, `init` keeps routes, layouts, adapter, and existing scripts. It adds Svartz dependencies and scripts, wraps the existing Vite export with `withSvartzHost`, and preserves any existing Svartz config and vault definitions. This wrapper supplies virtual-module aliases during SvelteKit's client build. If a file cannot be safely integrated, `init` reports the conflict before writing.

Rerun `npx svartz@latest init` after upgrading a scaffolded host. It updates only the exact older generated catchall loader to await lazy theme pages; a custom catchall remains yours.

Use `svartz build --vault <id>` to target one standalone vault. A SvelteKit host always builds all configured host vaults together, because they share one Vite build and adapter output.

## Turbo task sync

For the repository shell, the CLI syncs a managed Turbo/package surface at the config root:

- `package.json` scripts: `svartz:build`, `svartz:build:<vault-id>`, `svartz:dev:<vault-id>`, `svartz:preview:<vault-id>`, plus `svartz:dev`/`svartz:preview` fan-out scripts.
- `turbo.json` tasks: `//#svartz:build`, `//#svartz:build:<vault-id>`, `//#svartz:dev:<vault-id>`, and `//#svartz:preview:<vault-id>`.

The CLI only rewrites those managed `svartz:*` / `//#svartz:*` entries, so existing non-Svartz scripts and Turbo tasks stay untouched.

After initialization, `build` and `dev` leave the host's `package.json`, `turbo.json`, routes, Vite config, adapter, and `.svelte-kit` alone. Set `target: { type: "host" }` on each mounted vault. The host's adapter controls its final output, and its route files continue to take precedence. The host can import `virtual:svartz/host` to select published vault data. A custom route rendering `SvartzRuntimePage` awaits `prepareHostVault` in universal `load`, after removing SvelteKit's deployment base from the pathname. The generated catchall already does so; [`@svartz/ui`](../ui/README.md) has the loader example.

## Per-Vault Workspace Contract

For a vault like `docs`, the CLI now prepares:

```text
.svartz/vaults/docs/
├── .svelte-kit/   # SvelteKit internal dev/build state for this vault only
├── artifacts/     # generated Svartz runtime modules and page artifacts
├── dist/          # final adapter output for static builds
└── node_modules   # symlink to apps/web/node_modules for isolated prerender output
```

The repository shell keeps parallel vault builds from sharing `apps/web/.svelte-kit`. Existing hosts keep their own `.svelte-kit` and adapter output; Svartz only creates the vault-scoped artifacts and dependency bridge.

## Build Env Passed To `apps/web`

The CLI derives and sets:

- `SVARTZ_OUT_DIR`
- `SVARTZ_KIT_OUT_DIR`
- `SVARTZ_BASE_PATH`
- `SVARTZ_TARGET_TYPE`
- `SVARTZ_THEME_MODULE_PATH`
- `SVARTZ_ARTIFACTS_MODULE_PATH`
- `SVARTZ_HOST_MODULE_PATH` for the generated host registry, including single-vault builds
- `SVARTZ_TAILWIND_SOURCES_PATH`

For provider-style targets that rely on `adapter-auto`, the CLI also sets the matching platform environment variables for the selected vault before invoking Vite.

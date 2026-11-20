# `svartz`

`svartz` builds and serves configured vaults as SvelteKit sites. The package ships the app they build with, so a project needs only `svartz.config.ts` and its vaults. A vault with `target: { type: "host" }` mounts in the SvelteKit app at the config root instead.

It loads `svartz.config.ts`, resolves the selected vault, injects `@svartz/vite` into the app build, and prepares a vault-scoped workspace under `.svartz/vaults/<vaultId>/`.

## Commands

```sh
svartz init
svartz build
svartz build --vault docs
svartz dev --vault docs
svartz preview --vault docs
```

`svartz build` builds every configured vault: the host vaults together in the host app, then each other vault on its own. `--vault <id>` builds one; for a host vault, that means every host vault, since they share one Vite build and adapter output. `svartz dev` and `svartz preview` serve the `--vault` you name, or, without one, the host vaults in a host app, or else the first vault.

Parallel CLI processes also share a project build lock. A crashed build's lock recovers automatically on the next build. If a crash occurs during the brief recovery step, the CLI names the abandoned `.svartz/.vault-build.lock.recover` guard. Check that no Svartz build is running before removing that guard and retrying.

`npx svartz@latest init` initializes the directory where it runs. A new project gets `svartz.config.ts` with one `static` vault, a `vault/index.md` starter note, `.gitignore`, and a `package.json` whose `dev`, `build` and `preview` scripts run Svartz. It installs with npm unless an existing package manager is declared. It initializes Git for a new project unless already inside a Git worktree. `--no-install` and `--no-git` skip those steps. A directory that already has a Svartz config and no SvelteKit app is left as it is.

In an existing SvelteKit app, `init` keeps routes, layouts, adapter, and existing scripts. It adds Svartz dependencies and scripts, wraps the existing Vite export with `withSvartzHost`, and preserves any existing Svartz config and vault definitions. It adds the published Vite virtual-module type reference to `src/app.d.ts` while preserving host declarations. The wrapper supplies virtual-module aliases and adds Tailwind when the host has no Tailwind plugin. The generated catchall imports the CSS entry that scans the packed theme and UI components. If a file cannot be safely integrated, `init` reports the conflict before writing.

Rerun `npx svartz@latest init` after upgrading a scaffolded host. It updates the older virtual-module type reference and only exact older generated route/layout files; custom files remain yours.

## Several sites from one config

Each vault that isn't a host vault is its own site, with its own theme and target. Two `cloudflare-workers` vaults deploy as two Workers, each on its own domain:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "docs",
      path: "vaults/docs",
      theme: "./themes/caelestis",
      site: { title: "Caelestis", url: "https://docs.example.com" },
      target: { type: "cloudflare-workers", routes: [{ pattern: "docs.example.com", custom_domain: true }] },
    },
    {
      id: "wplace",
      path: "vaults/wplace",
      theme: "@svartz/theme-docs",
      site: { title: "Wplace developer docs", url: "https://wplace.example.com" },
      target: {
        type: "cloudflare-workers",
        name: "wplace-docs",
        routes: [{ pattern: "wplace.example.com", custom_domain: true }],
      },
    },
  ],
});
```

A `cloudflare-workers` target is its Worker's Wrangler config: everything but `type` goes into `.svartz/vaults/<id>/wrangler.json`, such as `name` (the vault's id when unset), `routes`, `vars`, `d1_databases` and the other bindings, and `env`. The build owns `main` and the assets directory, so a target can't set `main`. Deploy each vault with its config:

```sh
svartz build
npx wrangler deploy --config .svartz/vaults/docs/wrangler.json
npx wrangler deploy --config .svartz/vaults/wplace/wrangler.json
```

Under `svartz dev`, server plugins read the target's bindings, local secrets from `.dev.vars` beside `svartz.config.ts`, and local data from `.svartz/vaults/<id>/.wrangler/state`. Inspect it with `npx wrangler d1 execute <binding> --local --config .svartz/vaults/<id>/wrangler.json`.

## Turbo task sync

In a Turborepo workspace without a host app (one with `turbo.json` beside `svartz.config.ts`, such as this repository), the CLI syncs a managed Turbo/package surface at the config root:

- `package.json` scripts: `svartz:build`, `svartz:build:<vault-id>`, `svartz:dev:<vault-id>`, `svartz:preview:<vault-id>`, plus `svartz:dev`/`svartz:preview` fan-out scripts.
- `turbo.json` tasks: `//#svartz:build`, `//#svartz:build:<vault-id>`, `//#svartz:dev:<vault-id>`, and `//#svartz:preview:<vault-id>`.

The CLI only rewrites those managed `svartz:*` / `//#svartz:*` entries, so existing non-Svartz scripts and Turbo tasks stay untouched. Projects without `turbo.json` get neither file.

After initialization, `build` and `dev` leave the host's `package.json`, `turbo.json`, routes, Vite config, adapter, and `.svelte-kit` alone. Set `target: { type: "host" }` on each mounted vault. The host's adapter controls its final output, and its route files continue to take precedence. The host can import `virtual:svartz/host` to select published vault data. A custom route rendering `SvartzRuntimePage` awaits `prepareHostVault` in universal `load`, after removing SvelteKit's deployment base from the pathname. Import `virtual:svartz/tailwind-sources.css` in that custom route to load Svartz theme utilities. The generated catchall already does both; [`@svartz/ui`](../ui/README.md) has the loader example.

## Per-Vault Workspace Contract

For a vault like `docs`, the CLI prepares:

```text
.svartz/vaults/docs/
├── .svelte-kit/    # SvelteKit internal dev/build state for this vault only
├── .svartz/host/   # the generated registry this vault's build reads (a host app's lives in the project's .svartz/host/)
├── artifacts/      # generated Svartz runtime modules and page artifacts
├── dist/           # final adapter output for static builds
├── node_modules    # symlink to the app's dependencies, so generated modules share its Svelte and SvelteKit
└── wrangler.json   # cloudflare-workers only: generated from the target; it builds and deploys this vault
```

Every vault keeps its own build state, so builds never share a `.svelte-kit`. Existing hosts keep their own `.svelte-kit` and adapter output; Svartz only creates the vault-scoped artifacts and dependency bridge.

The shipped app lives in the `svartz` package (`app/`), and its build runs there. SvelteKit 3 writes its generated types into the app's `node_modules/$app`, so the install must be writable, as any ordinary install is. Themes and Wrangler resolve from the project.

## Build Env Passed To The Shipped App

The CLI derives and sets:

- `SVARTZ_OUT_DIR`
- `SVARTZ_KIT_OUT_DIR`
- `SVARTZ_PROJECT_ROOT`: where SvelteKit reads `.env`
- `SVARTZ_BASE_PATH`
- `SVARTZ_TARGET_TYPE`
- `SVARTZ_THEME_MODULE_PATH`
- `SVARTZ_ARTIFACTS_MODULE_PATH`
- `SVARTZ_HOST_MODULE_PATH` for the generated host registry, including single-vault builds
- `SVARTZ_TAILWIND_SOURCES_PATH`
- `SVARTZ_WRANGLER_CONFIG` for `cloudflare-workers`: the vault's generated Wrangler config, handed to `adapter-cloudflare`

For provider-style targets that rely on `adapter-auto`, the CLI also sets the matching platform environment variables for the selected vault before invoking Vite.

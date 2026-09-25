# Svartz

A SvelteKit publishing toolkit for Obsidian vaults, inspired by [Quartz](https://github.com/jackyzha0/quartz).

Svartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.

Some notable differences from Quartz are:

- A plugin pipeline with replaceable transformers and generators.
- Markdown notes stay inert. Use `.svx` for authored Svelte components.
- Multiple vaults and a built-in minimal theme. Vault locations live in `svartz.config.ts`.

## Monorepo build

From the repo root, run `pnpm i` once, then `pnpm build`.

## Usage

Initialize the current directory without cloning this repository:

```bash
npx svartz@latest init
npm run dev
```

The initializer creates a small SvelteKit shell, `svartz.config.ts`, and `vault/index.md`. It uses npm by default and an existing project's package manager when one is declared. `npm run build` creates the static site; `npm run preview` serves the built output.

In an existing SvelteKit app, the same command adds Svartz dependencies, configuration, and a Vite wrapper while preserving routes, layouts, adapter, and existing scripts. It adds `svartz:dev`, `svartz:build`, and `svartz:preview` scripts. Existing vault definitions remain in their config; `init` does not replace them. Use `--no-install` or `--no-git` when you want to handle those steps yourself.

Configure [vault mounts and canonical routes](docs/routes.md) when an existing app serves notes under paths such as `/journal`.
One SvelteKit host can [compose multiple mounted vaults](docs/host-vaults.md) in a single build.

The local CLI is vault-aware:

```bash
pnpm exec svartz build
pnpm exec svartz build --vault docs
pnpm exec svartz dev --vault docs
```

- `svartz build` builds every configured vault. In a SvelteKit host, all vaults share one build even when `--vault` is given.
- Vault artifacts live under `.svartz/vaults/<vault-id>`. A host app's adapter decides its site output path.
- Standalone vault builds keep SvelteKit internals under `.svartz/vaults/<vault-id>/.svelte-kit`.

### Managed Turbo tasks

For this repository's `apps/web` shell, the CLI also syncs root-level Turbo/package automation for the configured vaults:

- Root `package.json` scripts are managed under the `svartz:*` namespace.
- Root `turbo.json` tasks are managed under `//#svartz:*`.
- `//#svartz:build` depends on one `//#svartz:build:<vault-id>` task per configured vault.
- Per-vault `svartz:dev:<vault-id>` and `svartz:preview:<vault-id>` tasks are synced so you can run multiple vault processes through Turbo's TUI.

Examples:

```bash
turbo run svartz:build
pnpm svartz:dev
pnpm svartz:preview
```

## Theme Resolution

- `@svartz/theme-minimal` is the built-in fallback theme used when config does not specify one.
- Any other configured theme is resolved from the active app/workspace root, so published themes can be installed at the workspace root without becoming dependencies of `@svartz/vite`.
- During `svartz dev`, source aliasing only applies to theme packages that resolve to a local workspace package; published themes are loaded from their installed package entry instead.
- Tailwind source scanning is generated per vault by the CLI: `apps/web` imports a virtual CSS bridge, and the CLI writes that file with `@source` directives for the resolved theme and its component-library dependencies.

## Dev Watch Contract

`svartz dev` uses two watch modes on purpose:

- Vault content changes: `@svartz/vite` rebuilds the Svartz pipeline in-process, rewrites the generated runtime bridge modules, and triggers a browser full reload.
- Config, `apps/web/vite.config.ts`, active theme code, and best-effort workspace package source changes: the CLI rebuilds affected workspace packages if needed and restarts the dev runner cleanly.

Current behavior is correctness-first:

- Vault edits do a full pipeline rebuild plus browser full reload, not fine-grained per-stage HMR.
- Restart-class changes are process restarts, not unsafe hot-swaps.
- Workspace package watching currently targets `packages/config/src`, `packages/core/src`, `packages/plugins/src`, `packages/vite/src`, `packages/ui/src`, plus the active theme package source.

## Test Fixtures

`apps/web` no longer uses giant inline string-literal virtual modules for Vitest.

- Test runtime fixtures live in `apps/web/src/lib/svartz/testing/fixtures/`.
- `apps/web/vite.config.ts` aliases `virtual:svartz/theme` and `virtual:svartz/artifacts` to those files only in Vitest mode.

Host apps and themes can read the published [vault view](docs/vault-view.md) from `virtual:svartz/artifacts`.
- `@svartz/vite` tests cover vault change classification, rebuild triggering, and browser full-reload signaling.

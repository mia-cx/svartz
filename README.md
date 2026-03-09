# Svartz

A SvelteKit rewrite of [Quartz](https://github.com/jackyzha0/quartz).

Svartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.

Some notable differences from Quartz are:

- More robust theming, with some first-party themes for:
  - Notes (standard quartz-like)
  - Package docs (scanning JSdoc & linking to source on github)
  - API docs (input & output examples, route discovery for sveltekit & hono)
  - (TTRPG) Wikis.
- MDSveX by default, so you *can* use svelte components in your vault. (Can use [obsidian-markdown-file-suffix](https://github.com/git-no/obsidian-markdown-file-suffix) if you want to support different markdown extensions in Obsidian).
- Deploy multiple vaults from the same repo, by defining them in config

## Usage

Start using Svartz by either using this repository as a template, forking it, or using our init cli.

```bash
pnpm dlx svartz init
```

The local CLI is vault-aware:

```bash
pnpm --filter svartz build
pnpm --filter svartz build -- --vault docs
pnpm --filter svartz dev -- --vault docs
```

- `svartz build` without `--vault` builds every configured vault.
- Build outputs live under `.svartz/vaults/<vault-id>/dist`.
- SvelteKit internals live under `.svartz/vaults/<vault-id>/.svelte-kit` so parallel vault workspaces do not trample each other.

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
- `@svartz/vite` tests cover vault change classification, rebuild triggering, and browser full-reload signaling.

## TODO

- [ ] Everything
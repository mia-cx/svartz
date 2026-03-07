# Svartz TODO

Current backlog after landing the runtime plugin/theme/artifact architecture.

## Foundation already in place

- Single-vault `ResolvedConfig` contract and flattened config handoff.
- Theme contract, plugin contract, plugin runner, and route matcher in `@svartz/core`.
- Core pipeline in `@svartz/plugins`, including artifact emission to vault-scoped runtime outputs.
- Runtime-driven `@svartz/vite` package with `virtual:svartz/theme` and `virtual:svartz/artifacts`.
- Thin `apps/web` runtime shells for `/` and `[...slug]`.
- Multi-vault-safe output layout under `.svartz/vaults/<vaultId>/{artifacts,dist}`.

## Active backlog

High-priority implementation is in **NEXT_STEPS.md** (markdown/embedding, theme-minimal, @svartz/ui, CLI E2E, watch/HMR, then additional themes). The items below are either out of scope for that queue or deferred.

### 1) SEO and feeds

- Add sitemap generation.
- Add RSS/Atom support if still desired.
- Add OpenGraph/meta support.
- Add shared vault/site metadata config fields. Tracked in GitHub issue `#14`.

### 2) Dev experience and docs

- Document GitHub Actions workflow setup for Svartz CI.
- Improve caching/incremental rebuild behavior once watch mode is implemented.
- Add migration notes from Quartz v4 once the first production-ready flow is stable.
- Investigate shared i18n/l10n tooling and package shape. Tracked in GitHub issue `#10`.

## Keep open / deferred

- Vite+ migration after GA. Tracked in GitHub issue `#15`.
- Obsidian plugin for Svartz mdsvex support.

## Notes

- Multi-vault support is already in place.
- The runtime Vite bridge exists, but watch/HMR and CLI orchestration are still unfinished.
- `apps/web` should keep local ambient typings/test stubs for Svartz virtual modules and should not depend directly on `@svartz/vite` just for type resolution.

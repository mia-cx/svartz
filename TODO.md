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

### 1) CLI orchestration

- Implement the real CLI handoff that injects `@svartz/vite` into `apps/web` for build/dev.
- Implement `svartz build:all` multi-vault orchestration.
- Implement `svartz dev` orchestration around the runtime Vite flow.
- Add theme management flows (`theme:add/remove/list/migrate`) once the CLI surface is ready.

### 2) Runtime Vite completion

- Implement watch mode / HMR in `@svartz/vite`.
- Wire `handleChange` through the Vite dev server path.
- Verify end-to-end runtime integration with the real CLI entrypoint rather than only package/browser test coverage.

### 3) Markdown and transform parity

- Implement real OFM transforms.
- Implement real GFM transforms.
- Implement syntax highlighting transforms.
- Implement LaTeX / math transforms.
- Implement transclusions / embeds beyond the current contract surface, excluding recursive markdown section transclusion.

### 4) Theme and UI packages

- Build `@svartz/theme-minimal`.
- Decide whether `@svartz/ui` should exist as a shared theme-agnostic component package or stay folded into theme packages.
- Add additional default themes once `theme-minimal` proves the runtime model.

### 5) Site UX and page types

- Build real note layouts/navigation instead of the current runtime shell + test stubs only.
- Add folder pages, tag pages, and a proper not-found experience through theme/runtime integration.
- Add backlinks/graph/search UI components in the real app shell.
- Implement client-side search UI on top of the emitted search index.

### 6) Static assets and attachments

- Copy vault assets into the built site.
- Rewrite attachment/image references to final public paths.
- Lock conventions for `![[image.png]]` and standard markdown image links.

### 7) SEO and feeds

- Add sitemap generation.
- Add RSS/Atom support if still desired.
- Add OpenGraph/meta support.
- Add shared vault/site metadata config fields. Tracked in GitHub issue `#14`.

### 8) Dev experience and docs

- Document GitHub Actions workflow setup for Svartz CI.
- Improve caching/incremental rebuild behavior once watch mode is implemented.
- Add migration notes from Quartz v4 once the first production-ready flow is stable.
- Investigate shared i18n/l10n tooling and package shape. Tracked in GitHub issue `#10`.

## Keep open / deferred

- Vite+ migration after GA. Tracked in GitHub issue `#15`.
- Obsidian plugin for Svartz mdsvex support.

## Next plan queue

- Implement TOC extraction.
- Implement recursive markdown section transclusion for embeds, including heading-targeted section embedding.

## Notes

- Multi-vault support is already in place.
- The runtime Vite bridge exists, but watch/HMR and CLI orchestration are still unfinished.
- `apps/web` should keep local ambient typings/test stubs for Svartz virtual modules and should not depend directly on `@svartz/vite` just for type resolution.

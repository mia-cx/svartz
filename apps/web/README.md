# apps/web

`apps/web` is the SvelteKit shell that renders Svartz runtime output. The real `@svartz/vite` plugin is injected by the CLI for dev/build; this app stays decoupled from that package at rest.

## Runtime Fixtures In Tests

Vitest uses file-backed fixtures instead of inline virtual-module source strings:

- `src/lib/svartz/testing/fixtures/runtime-theme.ts`
- `src/lib/svartz/testing/fixtures/runtime-artifacts.ts`
- `src/lib/svartz/testing/fixtures/shared.ts`

`vite.config.ts` aliases `virtual:svartz/theme` and `virtual:svartz/artifacts` to those files only when `VITEST` is set. Real runtime builds still point those virtual modules at generated files under `.svartz/vaults/<vault-id>/artifacts/`.

## Dev/Build Ownership

- `svartz dev --vault <id>` owns `apps/web` dev startup.
- `svartz build` owns production builds and vault-specific env injection.
- `apps/web` should not add a direct dependency on `@svartz/vite` just to satisfy runtime tests.

## Watch Behavior

- Vault markdown or asset changes rebuild through `@svartz/vite` and then trigger a browser full reload.
- Config, theme, and workspace package changes restart the dev runner from the CLI side.

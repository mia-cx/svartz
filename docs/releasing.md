# Releasing Svartz packages

The v1 release is eleven public npm packages at version `1.0.0`: `@svartz/core`, `@svartz/plugins`, `@svartz/config`, `@svartz/ui`, five themes (`@svartz/theme-minimal`, `@svartz/theme-wiki`, `@svartz/theme-blog`, `@svartz/theme-docs`, `@svartz/theme-api-docs`), `@svartz/vite`, and `svartz`. The published `svartz@0.0.1` CLI predates this release. The legacy `@svartz/vault` and `@svartz/vite-plugin` names are not part of v1.

All eleven v1 packages use MCX v1.0. Each archive includes the full repository `LICENSE`; package metadata points to that file.

Use Node `20.19.x` or `22.12+`. The standalone initializer uses Vite 7. The CLI and Vite plugin accept Vite 7 and 8; an existing host supplies its own Vite version and adapter.

Before publication, run this from a clean, merged checkout:

```sh
pnpm i --frozen-lockfile
pnpm release:check
pnpm test
```

`release:check` builds the workspace, packs the eleven packages with pnpm, checks the license, runtime files, types, and resolved dependency ranges, then installs the tarballs outside the monorepo. It initializes, builds, and serves a fresh site. It also checks an existing Vite 8 SvelteKit host: the CLI resolves Vite 8, Svelte type checks pass, emitted CSS contains a utility from the packed theme/UI components, and both the host home and mounted note route build and serve. The check never publishes to npm. Set `SVARTZ_RELEASE_VERBOSE=1` to show consumer command output. Set `SVARTZ_RELEASE_KEEP_TEMP=1` to retain its temporary fixtures after a failure.

Publish only after the release check and review of the merged commit. Confirm npm access to the `@svartz` scope, then publish in dependency order:

1. `@svartz/core` and `@svartz/ui`
2. `@svartz/plugins` and `@svartz/config`
3. The five themes and `@svartz/vite`
4. `svartz` last, so `npx svartz@latest init` never points at unpublished dependencies

Run `pnpm publish --access public` in each package directory. pnpm resolves `workspace:` dependencies in the archive; `npm pack` and `npm publish` leave them unresolved. Check each published package's version and tarball on the registry before moving to its dependents. After the CLI is published, test `npx svartz@latest init` in an empty directory without a repository checkout, then run `npm run build` and `npm run dev` there. The build uses the static adapter; existing SvelteKit apps keep their own adapter and routes.

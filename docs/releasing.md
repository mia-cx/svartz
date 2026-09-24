# Releasing Svartz packages

The v1 release is seven public npm packages at version `1.0.0`: `@svartz/core`, `@svartz/plugins`, `@svartz/config`, `@svartz/ui`, `@svartz/theme-minimal`, `@svartz/vite`, and `svartz`. The published `svartz@0.0.1` CLI predates this release. The legacy `@svartz/vault` and `@svartz/vite-plugin` names are not part of v1.

Use Node `20.19.x` or `22.12+`. The standalone initializer uses Vite 7. The Vite plugin accepts Vite 7 and 8, and the release check builds an existing SvelteKit host with Vite 8. The host keeps its own adapter.

Before publication, run this from a clean, merged checkout:

```sh
pnpm i --frozen-lockfile
pnpm release:check
pnpm test
```

`release:check` builds the workspace, packs the seven packages with pnpm, checks runtime files, types, and resolved dependency ranges, then installs the tarballs outside the monorepo. It initializes, builds, and serves a fresh site, then integrates, builds, and serves an existing Vite 8 SvelteKit host. The check never publishes to npm. Set `SVARTZ_RELEASE_VERBOSE=1` to show consumer command output. Set `SVARTZ_RELEASE_KEEP_TEMP=1` to retain its temporary fixtures after a failure.

Publish only after the release check and review of the merged commit. Confirm npm access to the `@svartz` scope, then publish in dependency order:

1. `@svartz/core` and `@svartz/ui`
2. `@svartz/plugins` and `@svartz/config`
3. `@svartz/theme-minimal` and `@svartz/vite`
4. `svartz` last, so `npx svartz@latest init` never points at unpublished dependencies

Run `pnpm publish --access public` in each package directory. pnpm resolves `workspace:` dependencies in the archive; `npm pack` and `npm publish` leave them unresolved. Check each published package's version and tarball on the registry before moving to its dependents. After the CLI is published, test `npx svartz@latest init` in an empty directory without a repository checkout, then run `npm run build` and `npm run dev` there. The build uses the static adapter; existing SvelteKit apps keep their own adapter and routes.

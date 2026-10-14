# Releasing Svartz packages

Svartz ships eleven public npm packages in one fixed Changesets version group.
Private workspace packages receive no version bumps or release tags.
All public archives include the repository LICENSE and use MCX v1.0.

Publish in this dependency order:

1. `@svartz/core`, then `@svartz/ui`.
2. `@svartz/plugins`, then `@svartz/config`.
3. `@svartz/theme-minimal`, `@svartz/theme-wiki`, `@svartz/theme-blog`, `@svartz/theme-docs`, then `@svartz/theme-api-docs`.
4. `@svartz/vite`, then `svartz`.

## Each implementation PR

Run `pnpm changeset` for a public package change.
Select the affected package and describe the user-visible change.
Commit the generated `.changeset/*.md` file with the implementation.

CI requires a changeset for public `packages/*/src/**`, `packages/cli/template/**`, and `themes/*/src/**` changes.
The `no changeset` label exempts changes that need no release note.
CI still validates added or modified changesets when that label is present.

The fixed group keeps all eleven versions equal.
`pnpm release:version` runs Changesets, synchronizes theme versions, and updates the lockfile.
Theme contract versions remain independent of package versions.
Changesets is pinned to `3.0.3`.

## Release PR and publication

Implementation merges into `sveltekit-rewrite` update the bot's `changeset-release/sveltekit-rewrite` PR.
Its title and commit message are `chore(release): version packages`.
The Changesets action only opens or updates that PR.
It never publishes, tags, or creates GitHub releases.

The bot uses GitHub's built-in token.
GitHub may require you to approve workflows on its PR.
You can also dispatch Release validation with the full release-PR head SHA before merging.

Review the changelogs and merge the release PR.
The release plan checks the merged commit's associated PR.
Only the exact same-repository release PR merge authorizes publication.
Ordinary pushes never publish.
Pending changesets block publication.
A package version missing from npm counts as publishable.

Release validation runs `pnpm build`, `pnpm test`, and `pnpm release:check` before publication.
The reusable publish workflow uses the `npm-publish` environment and npm `11.17.0`.
It builds the merged commit and packs with `pnpm pack`.
pnpm rewrites workspace dependency ranges. `npm pack` does not.

The workflow publishes the exact tarballs in dependency order:

```sh
npm publish <tarball> --access public --provenance --ignore-scripts
```

A registry check skips an existing version only when its archive integrity matches.
Network errors and different archives fail the release.
Publication creates `<name>@<version>` tags and one GitHub release titled `Svartz <version>`.
The release uses the `svartz@<version>` tag and combines matching package changelog sections.

## One-time setup

npm requires a package to exist before you can configure its trusted publisher.
The [npm setup guide](https://docs.npmjs.com/trusted-publishers/) starts from that package's settings.
[npm's initial-publication issue](https://github.com/npm/cli/issues/8544) tracks this limitation.
The old `svartz@0.0.1` package does not create the other ten packages.

Before merging the first version PR, Mia must complete these steps:

1. Confirm npm ownership of `svartz` and publishing access to the `@svartz` scope.
2. From a clean, merged `1.0.0` checkout, log in with `npm login` and run the bootstrap below.
3. Create the GitHub `npm-publish` environment. Allow `sveltekit-rewrite` and choose its approval rules.
4. Configure a GitHub Actions trusted publisher for each of the eleven packages.
5. Allow GitHub Actions to create pull requests in the repository's Actions settings.

Each npm publisher uses owner `mia-cx`, repository `svartz`, workflow filename `release.yml`, and environment `npm-publish`.
Enable the allowed action `npm publish`.
npm checks the calling filename for reusable workflows. Use `release.yml`, not `package-publish.yml`.
Current npm configurations need their first successful publish within two days.
Configure them when the next release is ready. Recreate expired configurations.

Run bootstrap on a maintainer's machine:

```sh
pnpm i --frozen-lockfile
pnpm release:bootstrap
```

Bootstrap requires every public version to be `1.0.0`.
It runs `release:check`, packs with pnpm, and publishes through the maintainer's npm login.
It skips identical published versions, so an interrupted bootstrap can resume.
It creates no tags or GitHub releases.
Configure trusted publishers after bootstrap creates the packages.
CI publication uses OIDC and needs no npm token secret.

## Validation and retries

`pnpm test:release` tests release scripts, registry checks, and real Changesets versioning.
`pnpm release:check` builds and packs all eleven packages outside the monorepo.
It checks licenses, exports, types, runtime files, and resolved dependency ranges.
It installs a fresh CLI consumer and builds and serves its static site.
It checks a mounted Vite 8 host, protected SVX, emitted CSS, and Svelte types.
The same packed host always builds with `@sveltejs/adapter-cloudflare`.
The check requires a Worker entry and prerendered mounted note HTML in the Cloudflare output.
It never publishes.

Use `SVARTZ_RELEASE_VERBOSE=1` for consumer output.
Use `SVARTZ_RELEASE_KEEP_TEMP=1` to retain temporary fixtures.

To retry, dispatch Release on `sveltekit-rewrite`.
Set `retry_release_commit` to the full 40-character release merge SHA.
The workflow checks ancestry, release PR identity, pending notes, and current package versions.
It validates again before publishing.
A newer release blocks replay of an older version.
Existing package tags must point to the same commit.
Existing GitHub releases are skipped.

Publication and deployment are separate. This flow does not deploy a site.

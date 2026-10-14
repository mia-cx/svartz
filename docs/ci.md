# GitHub Actions for a Svartz site

For a new project created by `svartz init`, commit its `package-lock.json`, then add this npm workflow as `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run test --if-present
```

For a Svartz vault added to an existing SvelteKit app, keep that app's package-manager setup, cache, lockfile install, and test steps. Replace its build command with the corresponding `svartz:build` script, such as `pnpm svartz:build` or `npm run svartz:build`. That command builds the vault through Svartz while leaving the host's adapter and routes in charge. For a scaffolded site, the build output is `.svartz/vaults/notes/dist`; an existing host writes wherever its adapter is configured to write.

The workflow caches npm's package cache through `setup-node`. It installs dependencies from the lockfile on every run. [GitHub's setup-node guide](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#caching-packages-data) documents this cache behavior.

## This repository's pnpm workspace

The Svartz source repo uses the real [Workspace CI workflow](../.github/workflows/ci.yml).
It runs on PRs and pushes to `sveltekit-rewrite`.
Its actions are pinned to commit SHAs.
Node reads `24.20.0` from `.node-version`.
pnpm reads its version from the root `packageManager` field.

CI installs with `pnpm i --frozen-lockfile` and caches the pnpm store.
It installs Playwright Chromium for `@svartz/ui`.
It runs `pnpm test:release`, `pnpm build`, and `pnpm test`.
The Changeset check requires a note for public source changes, or the `no changeset` label.
Label changes rerun that check.

The [Release validation workflow](../.github/workflows/release-validation.yml) checks release PRs and merged release commits.
It also runs `pnpm release:check`, including packed static and Cloudflare hosts.
It supports manual validation of a full commit SHA.
Publication runs only after merged-release validation succeeds.
See [releasing](releasing.md) for bootstrap, trusted publishers, and retries.

The repository workflow is separate from the scaffolded site's example above.

Deployment of the official docs vault is tracked separately in [issue #1](https://github.com/mia-cx/svartz/issues/1).
These workflows do not deploy a site.

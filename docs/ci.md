# GitHub Actions for a Svartz site

`svartz init` creates a normal SvelteKit project. Commit its `package-lock.json`, then add this file as `.github/workflows/ci.yml` in that project:

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

For a Svartz vault added to an existing SvelteKit app, replace `npm run build` with `npm run svartz:build`. That command builds the vault through Svartz while leaving the host's adapter and routes in charge. Keep the host's own test step if it has one. For a scaffolded site, the build output is `.svartz/vaults/notes/dist`; an existing host writes wherever its adapter is configured to write.

The workflow caches npm's package cache through `setup-node`. It installs dependencies from the lockfile on every run. [GitHub's setup-node guide](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#caching-packages-data) documents this cache behavior.

## This repository's pnpm workspace

The Svartz source repo uses pnpm and Turbo. Its CI needs browser binaries for the UI tests. Use this workflow for the repository itself, not for a scaffolded site:

```yaml
name: Workspace CI
on:
  pull_request:
  push:
    branches: [sveltekit-rewrite]

permissions:
  contents: read

jobs:
  workspace:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: pnpm
      - uses: actions/cache@v5
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - run: pnpm i --frozen-lockfile
      - run: pnpm --filter @svartz/ui exec playwright install --with-deps chromium
      - run: pnpm build
      - run: pnpm test
```

`setup-node` caches the pnpm store. The second cache saves Turbo results under a new key for each commit and restores an earlier result when available. Do not cache `node_modules` or reuse one constant Turbo cache key. [GitHub's cache reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) says existing cache contents cannot be updated. Deployment of the official docs vault is tracked separately in [issue #1](https://github.com/mia-cx/svartz/issues/1); neither example deploys a site.

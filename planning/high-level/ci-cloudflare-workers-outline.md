# GitHub CI: Build & Deploy to Cloudflare Workers

Outline for `.github/workflows/deploy.yaml` (or similar).

## Trigger

```yaml
on:
  push:
    branches:
      - main  # or whatever your default branch is
  workflow_dispatch:  # manual trigger
```

## Structure

- **Gate on canonical repo:** `if: github.repository == 'mia-cx/svartz'`
- **Install deps** (pnpm)
- **Build** (SvelteKit + content pipeline via Vite plugin)
- **Deploy** (wrangler)

## Key parts

### 1. Secrets needed (in repo settings)

```
CLOUDFLARE_API_TOKEN    # wrangler auth
CLOUDFLARE_ACCOUNT_ID   # your CF account ID
```

### 2. wrangler.jsonc config (root or apps/site/)

```jsonc
{
  "name": "svartz",
  "type": "javascript",
  "main": "build/index.js",
  "build": {
    "command": "pnpm build",
    "cwd": "./apps/site"
  },
  "env": {
    "production": {
      "routes": [
        { "pattern": "svartz.example.com/*", "zone_name": "example.com" }
      ]
    }
  }
}
```

### 3. svelte.config.js (apps/site/)

```ts
import adapter from '@sveltejs/adapter-cloudflare-workers';

export default {
  kit: {
    adapter: adapter(),
    prerender: {
      crawl: true,
      entries: ['*'],  // prerender all dynamic routes
    },
  },
};
```

### 4. Workflow file

```yaml
name: Build & Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-and-deploy:
    if: ${{ github.repository == 'mia-cx/svartz' }}
    runs-on: ubuntu-latest
    name: Build and Deploy
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Get pnpm store directory
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache pnpm modules
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        working-directory: ./apps/site
        run: pnpm build

      - name: Deploy to Cloudflare Workers
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        working-directory: ./apps/site
        run: pnpm exec wrangler deploy --compatibility-date 2026-03-03
```

## Notes

- **`--frozen-lockfile`:** Ensures exact deps (like `npm ci`).
- **Prerender:** The Cloudflare adapter supports prerendering; set `prerender.entries` to routes you want static.
- **Account ID:** Find at https://dash.cloudflare.com/ → Account → top-right corner.
- **API token:** Create at https://dash.cloudflare.com/profile/api-tokens with "Workers Scripts" permission.
- **Branch/env:** Could add `if: github.ref == 'refs/heads/main'` to gate deploy (vs just PR builds).
- **Docs vault:** If using the Quartz-style `-d docs` override, pass it to the build step:
  ```bash
  VAULT_DIR=docs pnpm build
  ```
  (And handle it in the pipeline/config to read the env var.)

## Extensions

- **Preview deploys:** Add a `deploy-preview` job triggered on PR that uses a staging subdomain or `wrangler publish --compatibility-flags ...`.
- **Multienv:** Use wrangler `env` config (production, staging) and deploy to different envs on different branches.
- **Slack notification:** Post deploy status to Slack after success/failure.

---

This is a minimal, canonical-repo-only deploy. Adjustments:
- If using static site (not Workers), swap `adapter-cloudflare-workers` for `adapter-cloudflare` (Pages).
- If using Node, swap adapter to `@sveltejs/adapter-node`.

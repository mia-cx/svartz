# Multi-vault, multi-target deployment (architecture draft)

## Problem

- Single vault → single output → single deployment is simple.
- Multiple vaults → multiple targets (different Workers, Pages, GitHub Pages, subdomains) → need:
  - **Multiple build outputs** (one artifact per vault/target combo)
  - **Config-driven routing** (which vault goes where)
  - **CI integration** (pick correct artifact for each target)

## Config shape (conceptual)

```ts
// svartz.config.ts
vaults: [
  {
    path: 'vaults/docs',  // relative to config file, or absolute
    target: {
      rootPath: '/docs',
      output: 'build/docs',
      deploy: { type: 'worker', env: 'production', worker: 'svartz-docs' },
    },
  },
  {
    path: 'vaults/notes',
    target: {
      rootPath: '/',
      output: 'build/notes',
      deploy: { type: 'worker', env: 'production', worker: 'svartz-main' },
    },
  },
  {
    path: 'vaults/api-docs',
    target: {
      rootPath: '/',
      output: 'build/api-docs',
      deploy: { type: 'pages', env: 'production', project: 'api-docs' },
    },
  },
]
```

Each vault is a first-class unit with its path and associated deploy target.

## Build process

### CLI orchestrator + Turbo

1. **Config parser** reads `vaults` array.
2. **Build orchestrator** in CLI:
   ```ts
   for (const vault of config.vaults) {
     const { path, target } = vault;
     // Set env vars: VAULT_DIR=path, ROOT_PATH=target.rootPath, TARGET_TYPE=target.deploy.type, OUTPUT_DIR=target.output
     // Invoke Turbo build or SvelteKit build
   }
   ```
3. All outputs in `build/docs/`, `build/notes/`, etc.
4. **Turbo** parallelizes and caches builds (see `planning/cli-turbo-orchestration.md`)

## SvelteKit adapter per target

Each target type needs a different adapter:

| Target type          | Adapter                                | Notes                                                |
| -------------------- | -------------------------------------- | ---------------------------------------------------- |
| **Wrangler/Workers** | `@sveltejs/adapter-cloudflare-workers` | Needs separate Workers per vault if size limits hit. |
| **Cloudflare Pages** | `@sveltejs/adapter-cloudflare`         | Static output.                                       |
| **GitHub Pages**     | `@sveltejs/adapter-static`             | Static output.                                       |
| **Node**             | `@sveltejs/adapter-node`               | SSR capable.                                         |

**Challenge:** SvelteKit's `svelte.config.js` specifies one adapter. For multi-target builds:

- Either run **separate SvelteKit builds** (each with its own adapter), or
- Use a **dynamic adapter** in `svelte.config.js` (switch based on env var).

**Suggested approach:** Dynamic adapter based on `process.env.TARGET_TYPE`:

```ts
// apps/site/svelte.config.js
import cloudflareWorkersAdapter from '@sveltejs/adapter-cloudflare-workers';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';

const targetType = process.env.TARGET_TYPE || 'worker';
let adapter;
if (targetType === 'worker') {
  adapter = cloudflareWorkersAdapter();
} else if (targetType === 'pages') {
  adapter = cloudflareAdapter();
} else {
  adapter = staticAdapter();
}

export default {
  kit: {
    adapter,
    paths: {
      base: process.env.ROOT_PATH || '/',
    },
    prerender: { ... },
  },
};
```

## wrangler.jsonc sync

For Cloudflare Workers targets, sync `wrangler.jsonc` with the config:

```jsonc
{
  "env": {
    "docs": {
      "name": "svartz-docs",
      "main": "build/docs/index.js",
      "routes": [
        { "pattern": "docs.example.com/*", "zone_name": "example.com" },
      ],
    },
    "main": {
      "name": "svartz-main",
      "main": "build/notes/index.js",
      "routes": [
        { "pattern": "notes.example.com/*", "zone_name": "example.com" },
      ],
    },
  },
}
```

**Options:**

1. **Validate:** Read config, check that `wrangler.jsonc` has matching envs/routes. Warn if missing.
2. **Generate:** Build orchestrator updates `wrangler.jsonc` automatically (via code, not manual edits).

**Recommendation:** Start with validation; users can author `wrangler.jsonc` by hand. Later, auto-generation if it becomes tedious.

## CI workflow

```yaml
# .github/workflows/deploy.yaml
jobs:
  build:
    runs-on: ubuntu-latest
    if: ${{ github.repository == 'mia-cx/svartz' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:all # custom script that calls build orchestrator for each target
      # Artifacts now in build/docs/, build/notes/, build/api-docs/, etc.
      - uses: actions/upload-artifact@v4
        with:
          path: build/

  deploy-docs-worker:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - name: Deploy to Worker (docs)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          cd build/docs
          wrangler deploy --env docs

  deploy-notes-worker:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - name: Deploy to Worker (notes)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          cd build/notes
          wrangler deploy --env main
```

Or use a **matrix** for simpler code:

```yaml
deploy:
  needs: build
  strategy:
    matrix:
      target: [docs, notes, api-docs]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v4
    - name: Deploy ${{ matrix.target }}
      run: |
        cd build/${{ matrix.target }}
        # Deploy based on ${{ matrix.target }} type (worker, pages, etc.)
```

## Build script example

```bash
# pnpm build:all (scripts entry in monorepo root package.json)
# or in apps/site/package.json

#!/bin/bash
set -e

# Read svartz.config.ts, iterate targets, build each

TARGETS=$(node -e "const cfg = require('./svartz.config.ts'); console.log(JSON.stringify(cfg.vaults.targets))")

for target in $(echo $TARGETS | jq -r '.[] | @base64'); do
  _jq() {
    echo ${target} | base64 --decode | jq -r ${1}
  }

  VAULT=$(_jq '.vault')
  ROOT_PATH=$(_jq '.rootPath')
  OUTPUT_DIR=$(_jq '.output')
  DEPLOY_TYPE=$(_jq '.deploy.type')

  echo "Building vault=$VAULT rootPath=$ROOT_PATH output=$OUTPUT_DIR type=$DEPLOY_TYPE"

  VAULT_DIR="$VAULT" \
  ROOT_PATH="$ROOT_PATH" \
  TARGET_TYPE="$DEPLOY_TYPE" \
  npm run build -- --outDir "$OUTPUT_DIR"
done

echo "✅ All vaults built."
```

## Open questions (resolved)

- **Size limits:** Content is mostly static assets; unlikely to hit limits. Custom themes *could* exceed limits, but not a top priority. Monitor and optimize if needed.
- **Cross-vault links:** **Not supported.** Vaults are isolated entities (like Obsidian vaults). No linking between vaults; each is self-contained.
- **Shared dependencies:** **Share compiled pipeline.** If multiple vaults use the same themes/components/transforms, compile once. Routes and static assets are unique per vault/build artifact, so each upload only includes their content.
- **Single app vs. multiple apps:** **One `apps/web` SvelteKit app.** Routing and layouts are finalized during build (themes & components imported depend on vault config). Each build artifact is a complete, standalone output.

## Next steps

1. Confirm config structure with examples.
2. Build orchestrator script (start simple; iterate).
3. Test with two vaults targeting separate Workers.
4. Extend CI to deploy all artifacts.

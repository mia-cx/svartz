# CLI: `svartz dev`, `svartz preview`, and Vite plugin

## Overview

- **`svartz dev`** — Vite dev server + plugin (vault watching, HMR).
- **`svartz preview`** — Use Vite’s built-in **`vite preview`** to serve the already-built output (no custom “build --serve”).
- **`svartz build`** — Vite build; the **same plugin** runs the content pipeline so vault resolution lives in one place.

## Architecture

### One plugin for dev and build

**Build mode:**
- CLI sets env vars (e.g. `VAULT_DIR`, `ROOT_PATH`) and runs `vite build`.
- **Vite plugin** runs the content pipeline once at build start → writes `src/lib/generated/*`.
- No separate CLI pre-step; the plugin owns vault resolution in both modes.

**Dev mode:**
- CLI sets env vars and runs `vite dev`.
- **Same plugin** runs the pipeline, then watches the vault and re-runs on change → HMR.

**Preview:**
- After build, **`vite preview`** (or SvelteKit’s `pnpm preview`) serves the built output. No plugin needed for preview; it’s just static serving.

## `svartz dev` command

```bash
pnpm svartz dev
```

This:
1. Reads `svartz.config.ts`
2. Generates Turbo tasks for each vault (like `build:all`)
3. For each vault, sets `VAULT_DIR`, `ROOT_PATH`, `TARGET_TYPE` env vars
4. Runs `turbo run dev:vault:* --parallel` with SvelteKit dev server
5. Each dev server watches its vault and reloads on change

### Implementation

```ts
// packages/cli/src/commands/dev.ts
import { execSync } from 'child_process';
import { loadConfig, findProjectRoot } from './config';
import { ensureTurboTasks } from './turbo-sync';

export async function devCommand() {
  const projectRoot = findProjectRoot();
  const config = await loadConfig();

  console.log(`🚀 Starting dev servers for ${config.vaults.length} vault(s)...\n`);

  // Generate tasks
  await ensureTurboTasks(config, projectRoot);

  // Generate task names
  const taskNames = config.vaults
    .map(v => `dev:vault:${path.basename(v.path)}`)
    .join(' ');

  // Run with Turbo (parallel)
  try {
    execSync(`turbo run ${taskNames} --parallel`, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (err) {
    console.error('❌ Dev servers failed to start.');
    process.exit(1);
  }
}
```

### Turbo tasks for dev

```jsonc
// turbo.json
{
  "tasks": {
    "dev:vault:docs": {
      "cache": false,
      "persistent": true,
      "inputs": ["vaults/docs/**"],
      "env": ["VAULT_DIR=vaults/docs", "ROOT_PATH=/docs", "TARGET_TYPE=worker"],
    },
    "dev:vault:notes": {
      "cache": false,
      "persistent": true,
      "inputs": ["vaults/notes/**"],
      "env": ["VAULT_DIR=vaults/notes", "ROOT_PATH=/", "TARGET_TYPE=worker"],
    },
  },
}
```

Then in `apps/web/package.json`:

```json
{
  "scripts": {
    "dev:vault:*": "vite dev --mode ${VAULT_DIR}"
  }
}
```

(or simpler: just `vite dev`, plugin reads env vars)

---

## `svartz preview` command

After building, use Vite’s own preview:

```bash
pnpm svartz build:all
pnpm svartz preview   # or: cd apps/web && pnpm preview
```

**Implementation:** `svartz preview` runs `vite preview` (or delegates to `apps/web`’s `preview` script). No custom serve logic; no plugin involved — just serving the built output.

For multiple vaults, preview could either:
- Start one preview server per vault (different ports), or
- Document that users run `pnpm preview` from the app dir after building the vault they care about.

## Vite plugin (dev + build)

The plugin runs in **both** dev and build so vault resolution lives in one place:

**Build:** In `buildStart` (or similar), run the content pipeline once → write `src/lib/generated/*`. Env vars (`VAULT_DIR`, etc.) come from the CLI.

**Dev:** Same pipeline run, then watch vault files and re-run on change → trigger HMR.

So the plugin:
1. Reads `VAULT_DIR` (and related) env vars
2. Runs the content pipeline → writes artifacts
3. In dev only: watches vault, re-runs pipeline, triggers HMR

### Implementation

```ts
// packages/web/src/vite-plugins/vault-resolver.ts
import chokidar from 'chokidar';
import { ContentPipeline } from '@svartz/content-pipeline';
import path from 'path';

export function vaultResolverPlugin() {
  let config;
  let watcher;

  async function runPipeline(projectRoot: string, vaultDir: string) {
    const fullVaultPath = path.resolve(projectRoot, vaultDir);
    const pipeline = new ContentPipeline({
      vaultDir: fullVaultPath,
      outputDir: 'src/lib/generated',
    });
    await pipeline.build();
  }

  return {
    name: 'vault-resolver',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    // Build: run pipeline once so artifacts exist before Vite needs them
    async buildStart() {
      const vaultDir = process.env.VAULT_DIR;
      if (!vaultDir) return;
      const projectRoot = process.cwd();
      await runPipeline(projectRoot, vaultDir);
    },

    // Dev: run pipeline, then watch and re-run on change
    async configureServer(server) {
      if (config.command !== 'serve') return;

      const vaultDir = process.env.VAULT_DIR;
      if (!vaultDir) {
        console.warn('⚠️  VAULT_DIR not set; vault resolution disabled');
        return;
      }

      const projectRoot = process.cwd();
      const fullVaultPath = path.resolve(projectRoot, vaultDir);

      console.log(`👀 Watching vault: ${fullVaultPath}`);
      await runPipeline(projectRoot, vaultDir);

      watcher = chokidar.watch(fullVaultPath, {
        ignored: /(^|[\/\\])\.|node_modules/,
        awaitWriteFinish: { stabilityThreshold: 500 },
      });

      watcher.on('change', async (filePath) => {
        console.log(`🔄 Vault changed: ${filePath}`);
        try {
          await runPipeline(projectRoot, vaultDir);
          server.ws.send({ type: 'full', event: 'special', event_name: 'svartz:vault-updated' });
          console.log(`✅ Artifacts regenerated`);
        } catch (err) {
          console.error(`❌ Pipeline error: ${err.message}`);
        }
      });

      return () => { if (watcher) watcher.close(); };
    },
  };
}
```

### Register in `vite.config.ts`

```ts
// apps/web/vite.config.ts
import { vaultResolverPlugin } from './src/vite-plugins/vault-resolver';

export default defineConfig({
  plugins: [
    vaultResolverPlugin(),  // Runs pipeline in build + dev; watches in dev only
    sveltekit(),
  ],
});
```

---

## Dev flow example

```bash
$ pnpm svartz dev

🚀 Starting dev servers for 2 vault(s)...

[docs] 👀 Watching vault: /project/vaults/docs
[docs] ✅ Dev server running at http://localhost:5173

[notes] 👀 Watching vault: /project/vaults/notes
[notes] ✅ Dev server running at http://localhost:5174

# User edits a note in vaults/docs
[docs] 🔄 Vault changed: /project/vaults/docs/guide.md
[docs] ✅ Artifacts regenerated
[docs] ↻ Hot reload triggered
```

---

## Benefits

**Preview:** Use Vite’s `vite preview` — no custom serve command.

**Single plugin for vault resolution:**
- **Build:** Plugin runs pipeline in `buildStart`; one place owns artifact generation.
- **Dev:** Same plugin runs pipeline, then watches and triggers HMR.
- Env-driven (no static config per vault).

**No duplicate logic:** Pipeline invocation lives only in the plugin; CLI just sets env and calls Vite.

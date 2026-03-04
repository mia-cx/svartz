# CLI + Turbo for parallel builds and caching

## Cache layers (what we get from the current design)

Turbo caches **per task**. The artifact of `apps/web` (e.g. `.svelte-kit/`, `build/`) is the final bundle and does include bundled UI and theme code—but the **work** of building each dependency is cached separately:

| Layer | Task | Cached when |
|-------|------|-------------|
| **Vault** | Index + graph (e.g. `packages/vault` or pipeline) | Vault content unchanged |
| **@svartz/ui** | `build` → `dist/` | UI source unchanged |
| **@svartz/theme-*** | `build` → `dist/` (depends on `^build` e.g. ui) | Theme source unchanged |
| **apps/web** | `build` → app artifact (depends on `^build`: ui, themes, and consumed vault artifacts) | App + deps unchanged |

So: **UI and themes are pre-buildable and cacheable.** They are still “rebuilt into” the app in the sense that the final deployable contains their code, but Turbo does not re-run their `build` when only app code changed—it restores their outputs from cache. Only when UI or theme source changes do those tasks (and then the app build) run. Same idea as vault/index/graph: only rebuild the layer whose inputs changed; downstream layers run but can reuse cached dependency outputs.

## GitHub Actions cache

Use **`actions/cache`** so CI restores pnpm and Turbo instead of re-downloading and re-building every time. One **monorepo-wide** `pnpm install` at root; the store is shared and each package has its own `node_modules`.

**Strategy:**

1. **Single install** — Run `pnpm install` once at repo root. No per-package install in the workflow.
2. **Cache three things** — `.pnpm-store`, `**/node_modules`, `.turbo`. Two cache entries (install vs turbo) so you can key them appropriately (see below).
   - **`.pnpm-store`** — In CI, set `store-dir` in the workflow only (e.g. `pnpm config set store-dir .pnpm-store` before install) so the store lives in the repo for that job. **Do not** set `store-dir` in repo `.npmrc`; keep default `~/` store for local dev. Add `.pnpm-store` to `.gitignore`.
   - **`**/node_modules`** — All workspace `node_modules` (root + every package). Same key as the store so install and layout stay in sync.
   - **`.turbo`** — Turbo's task cache. Share it across builds with **`actions/cache`** (not upload-artifact: artifacts are for passing outputs between jobs in a run; cache is for reuse across runs). Key it with a **constant** (e.g. `turbo-cache`) so every build overwrites the same cache entry; after the first run, restores always hit and you get the previous run's `.turbo`. Let Turbo handle workspace/task-level invalidation internally (it already hashes task inputs).

3. **Order in workflow** — Set store-dir (CI only) → restore cache → `pnpm install` (no-op or fast when cache hits) → … build/test … → save cache.

**Does cache work across builds?** Yes. `actions/cache` is available to **future** workflow runs (same repo; any branch/PR). You provide a key; if a previous run saved that key, this run restores it. So each new build can reuse caches from earlier builds.

**When is it a cache miss?** Use the key to invalidate when the thing you cached would be wrong:
- **Install cache** (store + node_modules): key on **`pnpm-lock.yaml`** only. The lockfile is the single source of truth for what gets installed; when you add/remove/update a dependency, the lockfile changes → new key → cache miss → fresh install. Hashing all `package.json` files is redundant (the lockfile already encodes the resolved tree) and would cause unnecessary misses when you change only scripts or metadata.
- **Turbo cache** (`.turbo`): use a **constant key** (e.g. `turbo-cache`). Every build saves over that key; every build restores from it. After the first workflow run, you always get a cache hit and Turbo decides per task what to reuse (it hashes inputs internally). No need to tie the key to lockfile or turbo.json—let Turbo handle workspace caching.

After restore, `pnpm install` reuses the store and node_modules; `turbo build` reuses `.turbo` when task hashes match.

## Turbo's capabilities

Turbo is already in your monorepo (`turbo.json` at root). It:

- **Runs tasks in parallel** across packages
- **Caches build outputs** by content hash (rebuilds only if inputs changed)
- **Knows dependencies** (if app A depends on package B, runs B first)
- **Has a programmatic API** (`@turbo/repository` or `turbo run` via JS)

## Option 1: Define build targets in `turbo.json` (simpler)

Instead of the CLI orchestrating, define each vault build as a Turbo task:

```jsonc
// turbo.json
{
  "tasks": {
    "build:vault:docs": {
      "outputs": ["apps/site/build/docs/**"],
      "cache": true,
      "inputs": ["vaults/docs/**", "apps/site/src/**"],
    },
    "build:vault:notes": {
      "outputs": ["apps/site/build/notes/**"],
      "cache": true,
      "inputs": ["vaults/notes/**", "apps/site/src/**"],
    },
    "build:all-vaults": {
      "dependsOn": ["build:vault:docs", "build:vault:notes"],
      "cache": false,
    },
  },
}
```

Then in CLI or `package.json`:

```bash
pnpm turbo run build:all-vaults
```

**Pros:**
- Turbo handles parallelization and caching automatically
- Clear dependency graph
- Works with Cursor's `turbo build` command

**Cons:**
- Hardcoded task names per vault (not dynamic if vaults change)
- Still need CLI logic to set env vars per build

---

## Option 2: CLI auto-generates Turbo tasks (recommended)

The CLI reads `svartz.config.ts`, generates corresponding Turbo tasks on-the-fly, and executes them.

**No duplication:** Vaults are defined once in `svartz.config.ts`. Turbo tasks are auto-generated from that.

```ts
// packages/cli/src/build.ts
import { execSync } from 'child_process';
import { loadConfig } from './config';
import { ensureTurboTasks } from './turbo-sync';

export async function buildAllVaults() {
  const svartzConfig = await loadConfig();
  const projectRoot = findProjectRoot();
  
  // Generate or update turbo.json with tasks for each vault
  await ensureTurboTasks(svartzConfig, projectRoot);
  
  // Generate task names from vaults
  const taskNames = svartzConfig.vaults
    .map(v => `build:vault:${path.basename(v.path)}`);
  
  // Let Turbo orchestrate
  execSync(`turbo run ${taskNames.join(' ')} --parallel`, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}
```

The `ensureTurboTasks` helper:

```ts
// packages/cli/src/turbo-sync.ts
import * as fs from 'fs';
import * as path from 'path';

export async function ensureTurboTasks(config, projectRoot) {
  const turboPath = path.join(projectRoot, 'turbo.json');
  let turbo = {};

  // Load existing turbo.json
  if (fs.existsSync(turboPath)) {
    turbo = JSON.parse(fs.readFileSync(turboPath, 'utf-8'));
  }

  // Initialize tasks object if missing
  if (!turbo.tasks) {
    turbo.tasks = {};
  }

  // Generate tasks for each vault
  for (const vault of config.vaults) {
    const vaultName = path.basename(vault.path);
    const taskName = `build:vault:${vaultName}`;

    // Only add if missing
    if (!turbo.tasks[taskName]) {
      turbo.tasks[taskName] = {
        outputs: [vault.target.output ? `${vault.target.output}/**` : `build/${vaultName}/**`],
        cache: true,
        inputs: [
          `${vault.path}/**`,
          'apps/web/src/**',
          'packages/ui/**',
          'packages/markdown/**',
        ],
      };
    }
  }

  // Write back to turbo.json
  fs.writeFileSync(turboPath, JSON.stringify(turbo, null, 2));
}
```

**Pros:**
- Single source of truth: `svartz.config.ts`
- No duplication; tasks auto-generated
- Turbo handles parallelization, caching, dependency resolution
- Users don't edit `turbo.json` manually for vault builds

**Cons:**
- Modifies `turbo.json` (but only for Svartz tasks; other tasks untouched)
- Git diff can be noisy if tasks change frequently (mitigated by .gitignore or documenting the auto-gen behavior)

---

## Hybrid: Turbo + env vars for dynamic builds

Combine Turbo's task orchestration with env var overrides:

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "outputs": ["apps/site/build/**"],
      "cache": true,
      "inputs": ["vaults/**", "apps/site/src/**"],
      // Run the same build script, but with env vars to pick which vault
    },
  },
}
```

In `apps/site/package.json`:

```json
{
  "scripts": {
    "build": "node ../../packages/cli/dist/build-single-vault.js"
  }
}
```

Then CLI invokes for each vault:

```ts
export async function buildAllVaults() {
  const targets = await loadConfig().vaults.targets;
  
  // Run Vite build once per target, with env vars
  for (const target of targets) {
    process.env.VAULT_DIR = target.vault;
    process.env.ROOT_PATH = target.rootPath;
    process.env.OUTPUT_DIR = target.output;

    // Turbo caches this based on inputs
    execSync('turbo run build', { stdio: 'inherit' });
  }
}
```

**Trade-off:** Less parallelization (tasks run sequentially) but cleaner caching (single task definition).

---

## Recommendation

**Start with Option 2 (CLI uses Turbo API / subprocess):**

1. Define one generic `build` task in `turbo.json` (inputs = vaults + app)
2. CLI reads `svartz.config.ts`, generates task list dynamically
3. Invoke `turbo run build:vault:docs build:vault:notes` (or whatever)
4. Turbo parallelizes and caches automatically

**Later, if dynamic is too noisy:**

Move to **Option 1** (hardcoded tasks) once the vault structure stabilizes, or **implement Turbo task generation** (CLI generates `turbo.json` on init).

---

## Turbo API docs

- **npm:** `npm install --save-dev @turbo/repository`
- **Docs:** https://turbo.build/repo/docs/reference/sdk
- **Simple approach:** Just use `execSync('turbo run ...')` for now; migrate to full API if needed.

## Code example (simple subprocess approach)

```ts
// packages/cli/src/orchestrate.ts
import { execSync } from 'child_process';
import { loadConfig } from './config';

export async function buildAllVaults() {
  const config = await loadConfig();
  const targets = config.vaults.targets;

  console.log(`🚀 Building ${targets.length} vaults with Turbo...`);

  // Generate task names
  const tasks = targets
    .map(t => `build:vault:${t.vault}`)
    .join(' ');

  try {
    execSync(`turbo run ${tasks} --parallel --cache`, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('✅ All vaults built and cached.');
  } catch (err) {
    console.error('❌ Build failed.');
    process.exit(1);
  }
}
```

Then in `turbo.json`:

```jsonc
{
  "tasks": {
    "build:vault:docs": {
      "outputs": ["apps/site/build/docs/**"],
      "cache": true,
      "inputs": ["vaults/docs/**", "apps/site/src/**"],
    },
    // ... repeat for other vaults
  },
}
```

Or dynamically generate the task list from `svartz.config.ts` into `turbo.json` during `cli init`.

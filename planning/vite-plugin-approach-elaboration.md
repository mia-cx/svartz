# Vite plugin approach for multi-vault orchestration (elaboration)

## How it would work

A Vite plugin can hook into the build lifecycle and coordinate multiple builds, but it's fighting Vite's single-build design. Here are two approaches:

---

## Approach 1: Vite multi-config (simpler, but limited)

`vite.config.ts` exports an **array of configs** instead of a single config:

```ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { multiVaultPlugin } from './vite-plugins/multi-vault';

export default defineConfig([
  {
    name: 'vault-docs',
    plugins: [multiVaultPlugin({ vault: 'docs', rootPath: '/docs' }), sveltekit()],
    build: { outDir: 'build/docs' },
  },
  {
    name: 'vault-notes',
    plugins: [multiVaultPlugin({ vault: 'notes', rootPath: '/' }), sveltekit()],
    build: { outDir: 'build/notes' },
  },
]);
```

**When you run `vite build`**, Vite automatically builds all configs in sequence.

**Pros:**
- Clean, declarative
- Vite handles the orchestration
- Each build is isolated

**Cons:**
- Duplicates SvelteKit config (violates DRY)
- Hard to dynamically read from `svartz.config.ts` and generate these
- Not flexible if the number of vaults changes

---

## Approach 2: Plugin + Vite JS API (more dynamic)

A single `vite.config.ts` + a plugin that spawns multiple builds programmatically:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { multiVaultOrchestrator } from './vite-plugins/multi-vault-orchestrator';

export default defineConfig({
  plugins: [
    multiVaultOrchestrator(), // Orchestrates everything
    sveltekit(),
  ],
});
```

The plugin itself:

```ts
// vite-plugins/multi-vault-orchestrator.ts
import { build } from 'vite';
import { loadConfig } from '../config'; // Load svartz.config.ts

export function multiVaultOrchestrator() {
  let config;

  return {
    name: 'multi-vault-orchestrator',

    async configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async buildEnd() {
      // Only run on production build (not dev)
      if (config.command !== 'build') return;

      const svartzConfig = await loadConfig();
      const targets = svartzConfig.vaults.targets;

      console.log(`🚀 Building ${targets.length} vaults...`);

      for (const target of targets) {
        console.log(`\n📦 Building vault: ${target.vault} → ${target.output}`);

        // Spawn a separate Vite build for this target
        await build({
          // Inherit base config but override specifics
          ...config,
          build: {
            outDir: target.output,
          },
          define: {
            __VAULT_DIR__: JSON.stringify(target.vault),
            __ROOT_PATH__: JSON.stringify(target.rootPath),
          },
          // Don't write to disk yet; collect output
          write: false,
        });
      }

      console.log('✅ All vaults built.');
    },
  };
}
```

**Pros:**
- Fully dynamic; reads from `svartz.config.ts`
- Single `vite.config.ts`; no duplication

**Cons:**
- Runs sequentially (slower than parallel)
- `buildEnd` hook fires after the main build completes; triggering more builds inside it feels hacky
- State management is tricky (each spawned build needs isolated context)
- Vite doesn't "know" about the sub-builds; they're side effects

---

## Approach 3: CLI orchestrator (recommended; what you're doing)

Instead of a Vite plugin, the CLI in `@packages/cli/` orchestrates:

```bash
# packages/cli/index.ts
import { build } from 'vite';
import { loadConfig } from '../config';

export async function buildAll() {
  const svartzConfig = await loadConfig();
  const targets = svartzConfig.vaults.targets;

  for (const target of targets) {
    console.log(`Building ${target.vault}...`);

    // Invoke Vite build directly, per target
    await build({
      configFile: 'vite.config.ts',
      build: { outDir: target.output },
      define: {
        __VAULT_DIR__: JSON.stringify(target.vault),
        __ROOT_PATH__: JSON.stringify(target.rootPath),
      },
    });
  }
}
```

**Usage:**
```bash
pnpm cli build:all
```

**Pros:**
- Clean separation: CLI owns orchestration, Vite owns single builds
- Easier to debug (each build is explicit)
- Parallel builds trivial: use `Promise.all()` instead of `await`
- Can add other CLI commands (init, theme setup, etc.)
- Future: `pnpm cli dev --vault docs` to dev a single vault

**Cons:**
- Not a Vite plugin (but this is fine)
- Requires users to call the CLI instead of `vite build`

---

## Why the CLI approach is better

1. **Orchestration ≠ build step:** Multi-vault is a higher-level concern than Vite's job.
2. **Cleaner semantics:** `pnpm build:all` clearly means "build all vaults", not "run Vite".
3. **SvelteKit-friendly:** SvelteKit config stays simple; no multi-config gymnastics.
4. **Parallelizable:** Trivial to add `Promise.all()` for parallel builds later.
5. **Debuggable:** Each build is a separate Vite invocation; easier to troubleshoot.

---

## If you ever want a Vite plugin for something else

Good use cases for Vite plugins (not orchestration):

- **Virtual modules:** Generate `virtual:svartz-manifest` on the fly
- **Content watching:** Watch vault files, regenerate index + graph during dev
- **Metadata preprocessing:** Transform frontmatter before mdsvex sees it
- **Code generation:** Auto-generate types from schema

But **orchestration** belongs in the CLI.

---

## Summary

| Approach | Pros | Cons | Use case |
|---|---|---|---|
| **Vite multi-config** | Declarative, Vite handles it | Duplicates config, not dynamic | Small, fixed set of vaults |
| **Plugin + Vite JS API** | Dynamic, single config | Hacky, sequential, opaque | Academic interest only |
| **CLI orchestrator** | Clean, debuggable, flexible, parallelizable | Not a Vite feature | **← Recommended** |
| **Vite plugin (other uses)** | Composable, hooks into build | Not for orchestration | Virtual modules, watching, codegen |

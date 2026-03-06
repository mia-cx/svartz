# Plugin: Emit Artifacts

Core pipeline plugin for writing final artifacts to disk.

## Overview

**Plugin ID:** `core:emit-artifacts`  
**Stage:** `emitArtifacts`  
**Enforce:** `post`  
**Fatal:** `true` (artifact writing must succeed)

Compiles vault note content into `.svelte` page artifacts, emits an eager `index.ts` runtime module, and writes the vault-scoped artifact set to disk.

The plugin itself does **not** run in parallel with sibling plugins. The disk-writer inside the plugin writes artifact files in parallel using Effect.

## Outputs

Given `ResolvedConfig.outDir = .svartz/vaults/docs/dist`, the plugin writes:

```text
.svartz/vaults/docs/artifacts/
├── index.ts
└── pages/
    └── **/*.svelte
```

### `pages/**/*.svelte`

One compiled page artifact per note slug.

- source: `ctx.files`
- artifact key shape: `pages/<slug>.svelte`
- contents: mdsvex-compiled Svelte module plus exported `svartz` note metadata

### `index.ts`

One eager runtime module for global layouts/components:

- `index`
- `graph`
- `backlinks`
- `search`

## Output Location

Derived from the active vault `ResolvedConfig.outDir`:

```text
artifactsRoot = resolve(outDir, "..", "artifacts")
```

## Integration

- **Precondition:** `ctx.index` has been populated by `core:index`
- **Consumes:** `ctx.files`, `ctx.index`, `ctx.config.outDir`
- **Produces:** `ctx.artifacts` entries plus disk materialization
- **Depended on by:** `virtual:svartz/artifacts` and the runtime page shell

## Best Practices

✅ **DO:**
- keep this plugin as the last emitter in the stage
- treat `ctx.artifacts` as the canonical emitted output set
- keep artifact paths vault-scoped via `ResolvedConfig.outDir`
- write files in parallel internally only after artifact paths are finalized

❌ **DON'T:**
- run this hook in parallel with sibling plugins
- write into `apps/web/src/routes`
- assume a global artifact root shared by multiple vaults

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/overview]] — All core plugins overview
- [[plugins/index-content]] — Builds index for emission
- [[guides/runtime-vite-integration]] — How Vite consumes emitted artifacts

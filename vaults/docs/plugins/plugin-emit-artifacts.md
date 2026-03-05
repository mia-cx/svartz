# Plugin: Emit Artifacts

Core pipeline plugin for writing final artifacts to disk.

## Overview

**Plugin ID:** `core:emit-artifacts`  
**Stage:** `emit`  
**Enforce:** `default`  
**Fatal:** `true` (artifact writing must succeed)

Writes in-memory artifacts accumulated by previous stages to disk. Creates index.json, graph.json, backlinks.json, and other outputs.

## Function Signature

```typescript
/**
 * Create the emit-artifacts plugin.
 *
 * @description
 * Writes accumulated artifacts to disk:
 * - index.json — search index + manifest
 * - graph.json — link graph
 * - backlinks.json — reverse link index
 * - Additional custom artifacts
 *
 * Runs in emit stage after all processing complete.
 *
 * @returns Plugin for emit stage
 *
 * @example
 * ```ts
 * const plugin = emitArtifacts();
 * // Result: files written to .svartz/generated/
 * ```
 */
export function emitArtifacts(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:emit-artifacts",
    emit: (ctx) => {
      // Write artifacts to disk
    }
  }));
}
```

## Artifacts Written

### index.json

Search index and manifest of all notes.

```json
{
  "index": [
    {
      "slug": "docs/intro",
      "title": "Getting Started",
      "description": "An introduction...",
      "tags": ["tutorial"],
      "createdAt": "2024-01-15T00:00:00Z",
      "updatedAt": "2024-01-20T10:30:00Z"
    }
  ]
}
```

### graph.json

Link graph structure.

```json
{
  "nodes": [
    { "id": "docs/intro", "title": "Getting Started" },
    { "id": "docs/advanced", "title": "Advanced Guide" }
  ],
  "edges": [
    { "from": "docs/intro", "to": "docs/advanced", "type": "mentions" }
  ]
}
```

### backlinks.json

Reverse link index (which files reference which).

```json
{
  "docs/intro": ["docs/guide", "docs/faq"],
  "docs/advanced": ["docs/guide"]
}
```

## Output Location

Default: `.svartz/generated/` (relative to vault)

Per-vault override:
```typescript
vaults: {
  docs: {
    path: "./docs",
    outDir: "./dist/artifacts"  // Custom output directory
  }
}
```

## Integration

- **Precondition:** All previous stages complete
- **Postcondition:** Artifacts on disk, ready for consumption
- **Depends on:** All previous stages
- **Depended by:** SvelteKit app (reads artifacts)

## Best Practices

✅ **DO:**
- Write all artifacts in one pass
- Ensure directories exist before writing
- Validate artifact structure

❌ **DON'T:**
- Emit before all processing complete
- Write artifacts to version control
- Assume specific output directory structure

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview]] — All core plugins overview
- [[plugins/plugin-index-content]] — Builds index for emission

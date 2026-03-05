# Plugin: Resolve Links

Core pipeline plugin for wikilink resolution (stub).

## Overview

**Plugin ID:** `core:resolve-links`  
**Stage:** `resolveLinks`  
**Enforce:** `default`  
**Fatal:** `false`

Placeholder for wikilink resolution. Currently a stub; custom themes and plugins can hook here to resolve wikilinks to final slugs.

## Function Signature

```typescript
/**
 * Create a placeholder for wikilink resolution.
 *
 * @description
 * Stub plugin for the resolveLinks stage. The runner dispatches
 * file changes here in dev mode for hot reload. Custom themes
 * and plugins can add resolvers by hooking this stage.
 *
 * Currently: no-op (intentional stub for future extension)
 *
 * @returns Plugin for resolveLinks stage
 *
 * @example
 * ```ts
 * const plugin = resolveLinks();
 * // Currently: no-op
 * // Future: custom themes can add resolvers here
 * ```
 */
export function resolveLinks(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:resolve-links",
    resolveLinks: (ctx) => {
      // Stub: theme/consumer plugins can hook here to resolve wikilinks
    }
  }));
}
```

## Stage Purpose

The `resolveLinks` stage is reserved for:
1. Resolving wikilinks to their canonical slugs
2. Building link graph and backlinks
3. Validating link targets
4. Handling link cycles or conflicts

## Current State

**Status:** Intentional stub (not implemented yet)

**Why?**
- Link resolution strategies depend on theme requirements
- Different themes may use different resolution algorithms
- Consumers (Vite plugin, CLI) can add custom resolvers

## Future Extension

Custom themes can add resolvers:

```typescript
import { definePlugin } from "@svartz/core";

export const customLinkResolver = definePlugin(() => ({
  id: "custom:resolve-links",
  resolveLinks: (ctx) => {
    ctx.files.forEach(file => {
      // Custom link resolution logic
      if (file.links) {
        file.links = file.links.map(link => ({
          ...link,
          resolved: resolveWikilink(link.target, ctx.files)
        }));
      }
    });
  }
}));
```

---

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

---

## Stage 6: Emit

Final stage where artifacts are written:

```
resolveLinks → emit
              └─ emitArtifacts
             → (Done)
```

---

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

---

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview#Stage 6: Emit]] — Stage details
- [[plugins/plugin-discover-files]] — Discovery (first stage)

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

## Integration

- **Precondition:** All previous stages complete
- **Postcondition:** Links resolved (currently: no-op)
- **Depends on:** All previous stages
- **Depended by:** `emitArtifacts` (for backlinks)

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview]] — All core plugins overview
- [[plugins/plugin-emit-artifacts]] — Follows this stage

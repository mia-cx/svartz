# Plugin: Index Content

Core pipeline plugin for building search index and manifest.

## Overview

**Plugin ID:** `core:index-content`  
**Stage:** `indexContent`  
**Enforce:** `post` (runs after description extraction)  
**Fatal:** `true` (index building is critical)

Aggregates all processed files into structured index for search, manifest, and metadata artifacts.

## Function Signature

```typescript
/**
 * Create the index-building plugin.
 *
 * @description
 * Builds search index and manifest from all processed files.
 * Aggregates metadata (title, slug, tags, dates) and stores
 * in-memory for emit stage to write to disk.
 *
 * Runs post-transform to ensure descriptions are available.
 *
 * @returns Plugin for indexContent stage
 *
 * @example
 * ```ts
 * const plugin = indexContent();
 * // Result: ctx.artifacts.index populated
 * //         ctx.artifacts.manifest populated
 * ```
 */
export function indexContent(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:index-content",
    indexContent: {
      run: (ctx) => {
        const index = ctx.files.map(file => ({
          slug: file.slug,
          title: file.frontmatter.title || file.slug,
          description: file.description,
          tags: file.frontmatter.tags || [],
          createdAt: file.createdAt,
          updatedAt: file.updatedAt
        }));
        ctx.artifacts = { ...ctx.artifacts, index };
      },
      options: { fatal: true, enforce: "post" }
    }
  }));
}
```

## Output Structure

**In-memory index (used by emit plugin):**
```typescript
{
  artifacts: {
    index: [
      {
        slug: "docs/intro",
        title: "Getting Started",
        description: "An introduction to the project...",
        tags: ["tutorial", "beginner"],
        createdAt: "2024-01-15T00:00:00Z",
        updatedAt: "2024-01-20T10:30:00Z"
      }
    ]
  }
}
```

**Written to disk by emit plugin:**
```json
{
  "index": [
    {
      "slug": "docs/intro",
      "title": "Getting Started",
      "description": "An introduction...",
      "tags": ["tutorial", "beginner"],
      "createdAt": "2024-01-15T00:00:00Z",
      "updatedAt": "2024-01-20T10:30:00Z"
    }
  ]
}
```

## Use Cases

- **Search:** Full-text search uses index for ranking
- **Previews:** List pages show description for UX
- **Metadata:** Frontmatter extraction for all files
- **SEO:** Schema markup generation
- **Analytics:** Track vault statistics

## Integration

- **Precondition:** `transformDescription` completed
- **Postcondition:** Search index and manifest built in memory
- **Depends on:** `transformDescription` (for descriptions)
- **Depended by:** `emitArtifacts` (writes to disk)

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview]] — All core plugins overview
- [[plugins/plugin-transform-description]] — Extracts descriptions
- [[plugins/plugin-emit-artifacts]] — Writes index to disk

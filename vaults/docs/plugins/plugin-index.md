# Plugin: Transform Description

Core pipeline plugin for extracting note descriptions/summaries.

## Overview

**Plugin ID:** `core:transform-description`  
**Stage:** `indexContent`  
**Enforce:** `default`  
**Fatal:** `false`

Extracts the first 1-3 sentences from note content to populate the `description` field for search results, previews, and metadata.

## Function Signature

```typescript
/**
 * Create a transformer plugin for description extraction.
 *
 * @description
 * Analyzes note content and extracts the first 1-3 sentences
 * to populate `file.description` property. Used for search result
 * snippets, vault indexes, and metadata.
 *
 * Runs during indexContent stage after all transformations complete.
 *
 * @returns Plugin for indexContent stage
 *
 * @example
 * ```ts
 * const plugin = transformDescription();
 * // Content: "# Title\n\nFirst sentence. Second. Third."
 * // Result: file.description = "First sentence. Second. Third."
 * ```
 */
export function transformDescription(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-description",
    indexContent: (ctx) => {
      ctx.files.forEach(file => {
        file.description = extractDescription(file.content);
      });
    }
  }));
}
```

## Behavior

1. Parse markdown content
2. Extract first paragraph (ignoring title/headers)
3. Take first 1-3 sentences
4. Trim to reasonable length (e.g., 160 chars)
5. Populate `file.description`

## Example

**Input:**
```markdown
# My Note

This is the introduction. It explains the concept.
This paragraph provides details.

More content here...
```

**Output:**
```typescript
file.description = "This is the introduction. It explains the concept."
```

---

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
      },
      // ... more entries
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

---

## Stage 4: Index Content

Both plugins run sequentially:

```
transformContent → indexContent (sequential)
                   ├─ transformDescription (default)
                   └─ indexContent (post)
                → resolveLinks → emit
```

**Why sequential?**
- Description must be extracted first
- Index depends on descriptions being available

---

## Integration

- **Precondition:** All transformContent complete, descriptions available
- **Postcondition:** Search index and manifest built in memory
- **Depends on:** `transformDescription` (for descriptions)
- **Depended by:** `emitArtifacts` (writes index to disk)

## Best Practices

✅ **DO:**
- Run description extraction before indexing
- Store full metadata in index
- Include all relevant fields (dates, tags, etc.)

❌ **DON'T:**
- Index before transformations complete
- Lose metadata during aggregation
- Assume specific field names without checking config

---

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview#Stage 4: Index Content]] — Stage details
- [[plugins/plugin-emit-artifacts]] — Writing index to disk

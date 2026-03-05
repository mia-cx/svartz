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

## Integration

- **Precondition:** All `transformContent` complete
- **Postcondition:** `file.description` populated
- **Runs before:** `indexContent` (for description availability)

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/overview]] — All core plugins overview
- [[plugins/index-content]] — Builds index with descriptions

# Plugin: Transform GFM

Core pipeline plugin for GitHub Flavored Markdown processing.

## Overview

**Plugin ID:** `core:transform-gfm`  
**Stage:** `transformContent`  
**Enforce:** `default` (runs in parallel with other default transformers)  
**Fatal:** `false` (errors are collected)

Processes GitHub Flavored Markdown syntax including tables, strikethrough, task lists, and autolinks.

## Function Signature

```typescript
/**
 * Create a transformer plugin for GitHub Flavored Markdown.
 *
 * @description
 * Processes GFM syntax:
 * - Tables (| col1 | col2 |)
 * - Strikethrough (~~text~~)
 * - Task lists (- [x] item)
 * - Autolinks (<https://example.com>)
 *
 * Runs in parallel with other default transformers.
 *
 * @returns Plugin for transformContent stage
 *
 * @example
 * ```ts
 * const plugin = transformGfm();
 * // Transforms: | col1 | col2 | → ready for rendering
 * ```
 */
export function transformGfm(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-gfm",
    transformContent: (ctx) => {
      ctx.files.forEach(file => {
        file.content = processGfm(file.content);
      });
    }
  }));
}
```

## Features Transformed

- **Tables** — Markdown tables with pipes and dashes
- **Strikethrough** — `~~deleted text~~`
- **Task lists** — `- [x] completed`, `- [ ] pending`
- **Autolinks** — `<https://example.com>`

## Integration

- **Precondition:** `discover` and `filterUnpublished` completed
- **Postcondition:** `file.content` with GFM syntax processed
- **Runs parallel with:** `transformSyntax`, `transformLatex`, `transformOfm`

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview]] — All core plugins overview

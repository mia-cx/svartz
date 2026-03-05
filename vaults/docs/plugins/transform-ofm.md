# Plugin: Transform OFM

Core pipeline plugin for Obsidian Flavored Markdown processing.

## Overview

**Plugin ID:** `core:transform-ofm`  
**Stage:** `transformContent`  
**Enforce:** `default`  
**Fatal:** `false`

Processes Obsidian-specific markdown features like callouts, embeds, and citations.

## Function Signature

```typescript
/**
 * Create a transformer plugin for Obsidian Flavored Markdown.
 *
 * @description
 * Processes Obsidian-specific syntax:
 * - Callouts (> [!note] Title)
 * - Block embeds (![[file.md]])
 * - Citations and references
 *
 * @returns Plugin for transformContent stage
 */
export function transformOfm(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-ofm",
    transformContent: (ctx) => {
      ctx.files.forEach((file) => {
        file.content = processObsidianMarkdown(file.content);
      });
    },
  }));
}
```

## Features Transformed

- **Callouts** — `> [!note]`, `> [!warning]`, `> [!info]`, etc.
- **Block embeds** — `![[file.md]]`
- **Link citations**
- **Obsidian-specific syntax**

## Integration

- **Precondition:** `discover` and `filterUnpublished` completed
- **Postcondition:** `file.content` with Obsidian syntax processed
- **Runs parallel with:** `transformGfm`, `transformSyntax`, `transformLatex`

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/overview]] — All core plugins overview

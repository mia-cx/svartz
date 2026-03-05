# Plugin: Transform Syntax

Core pipeline plugin for syntax highlighting preparation.

## Overview

**Plugin ID:** `core:transform-syntax`  
**Stage:** `transformContent`  
**Enforce:** `default`  
**Fatal:** `false`

Prepares code blocks and syntax-highlighted content for rendering.

## Function Signature

```typescript
/**
 * Create a transformer plugin for syntax highlighting.
 *
 * @description
 * Prepares code blocks for syntax highlighting:
 * - Annotates code blocks with language
 * - Extracts language identifiers
 * - Marks highlighted lines
 *
 * @returns Plugin for transformContent stage
 */
export function transformSyntax(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-syntax",
    transformContent: (ctx) => {
      ctx.files.forEach((file) => {
        file.content = processSyntaxBlocks(file.content);
      });
    },
  }));
}
```

## Features

- **Code block parsing** — Extracts language tags (`python, `ts, etc.)
- **Line highlighting** — Marks important lines for emphasis
- **Language detection** — Falls back to auto-detection if not specified

## Integration

- **Precondition:** `discover` and `filterUnpublished` completed
- **Postcondition:** `file.content` with syntax blocks prepared
- **Runs parallel with:** `transformGfm`, `transformOfm`, `transformLatex`

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/overview]] — All core plugins overview

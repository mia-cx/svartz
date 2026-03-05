# Plugin: Transform LaTeX

Core pipeline plugin for LaTeX and math block handling.

## Overview

**Plugin ID:** `core:transform-latex`  
**Stage:** `transformContent`  
**Enforce:** `pre` (runs before default transformers)  
**Fatal:** `false`

Processes LaTeX math blocks and inline math notation for rendering with KaTeX or MathJax.

## Function Signature

```typescript
/**
 * Create a transformer plugin for LaTeX math.
 *
 * @description
 * Processes mathematical notation:
 * - Block math ($$...$$)
 * - Inline math ($...$)
 * - LaTeX commands
 *
 * Enforces `pre` to ensure math blocks are processed before other transformers.
 *
 * @returns Plugin for transformContent stage
 */
export function transformLatex(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-latex",
    transformContent: {
      run: (ctx) => {
        ctx.files.forEach(file => {
          file.content = processLatex(file.content);
        });
      },
      options: { enforce: "pre" }  // Run before default transformers
    }
  }));
}
```

## Features

- **Block math** — `$$...$$` on separate lines
- **Inline math** — `$...$` within text
- **LaTeX commands** — `\frac{}{}`, `\sqrt{}`, etc.
- **Escaping** — Proper handling of literal `$` symbols

## Why Pre-Enforce?

Math blocks are processed first (with `enforce: "pre"`) to prevent other transformers from incorrectly parsing math notation as markdown.

## Integration

- **Precondition:** `discover` and `filterUnpublished` completed
- **Postcondition:** `file.content` with LaTeX blocks processed
- **Runs before:** All default transformers (`transformGfm`, `transformOfm`, `transformSyntax`)

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview]] — All core plugins overview

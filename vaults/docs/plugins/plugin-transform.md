# Plugin: Transform GFM

Core pipeline plugin for GitHub Flavored Markdown processing.

## Overview

**Plugin ID:** `core:transform-gfm`  
**Stage:** `transformContent`  
**Enforce:** `default` (runs in parallel with other default transformers)  
**Fatal:** `false` (errors are collected)

Processes GitHub Flavored Markdown syntax including tables, strikethrough, task lists, and autolinks.

## Purpose

Transform GitHub-flavored markdown features so they're ready for rendering. Runs in parallel with other content transformers for efficiency.

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

- **Tables** — Markdown tables
- **Strikethrough** — `~~deleted text~~`
- **Task lists** — `- [x] completed`, `- [ ] pending`
- **Autolinks** — `<https://example.com>`

---

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
      ctx.files.forEach(file => {
        file.content = processObsidianMarkdown(file.content);
      });
    }
  }));
}
```

## Features Transformed

- **Callouts** — `> [!note]`, `> [!warning]`, etc.
- **Block embeds** — `![[file.md]]`
- **Link citations**
- **Obsidian-specific syntax**

---

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
      ctx.files.forEach(file => {
        file.content = processSyntaxBlocks(file.content);
      });
    }
  }));
}
```

## Features

- **Code block parsing** — Extracts language tags
- **Line highlighting** — Marks important lines
- **Language detection** — Falls back to auto-detection

---

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
- **LaTeX commands** — `\frac{}{}`, etc.
- **Escaping** — Proper handling of literal `$` symbols

## Why Pre-Enforce?

Math blocks are processed first to prevent other transformers from incorrectly parsing math notation as markdown.

---

## Stage 3: Transform Content (All Together)

All four transformers run in `transformContent` stage:

```
discover → filterUnpublished → transformContent (parallel)
                                ├─ transformLatex (pre)
                                ├─ transformGfm (default)
                                ├─ transformSyntax (default)
                                ├─ transformOfm (default)
                                └─ [other default/post transformers]
                             → indexContent → ...
```

**Enforce order:**
1. `pre` (LaTeX) runs first
2. `default` (GFM, Syntax, OFM) run in parallel
3. `post` (custom transformers) run last

---

## Integration

- **Precondition:** `discover` and `filterUnpublished` completed
- **Postcondition:** `file.content` transformed and ready for rendering
- **Dependencies:** All run independently (can be reordered or disabled)

## Best Practices

✅ **DO:**
- Keep transformers focused on one task
- Avoid conflicts (e.g., don't double-process)
- Test with real vault content

❌ **DON'T:**
- Modify file structure (only transform `content`)
- Assume order (only `pre` vs `default` vs `post`)
- Break markdown syntax unintentionally

---

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview#Stage 3: Transform Content]] — Stage details
- [[plugins/plugin-utilities]] — Utility functions for parsing

# Plugin: Discover Files

Core pipeline plugin for vault discovery and file traversal.

## Overview

**Plugin ID:** `core:discover-files`  
**Stage:** `discover`  
**Enforce:** `default` (can run parallel, but typically runs alone)  
**Fatal:** `false` (errors are collected)

Traverses vault directory recursively, reads file contents, parses YAML frontmatter, and generates deterministic slugs for every markdown file. Sets the foundation for all downstream plugins.

## Purpose

1. **Traverse** vault directory according to `vaultConfig.include` / `exclude` patterns
2. **Filter** via `.gitignore` and config patterns
3. **Read** file contents (markdown)
4. **Parse** frontmatter YAML
5. **Generate** deterministic, conflict-detecting slugs
6. **Populate** `ProcessedFile[]` in context

## Function Signature

````typescript
/**
 * Create a vault file discovery plugin.
 *
 * @description
 * Traverses vault directory recursively, reading markdown files and parsing
 * YAML frontmatter. Generates deterministic slugs for each file, using path
 * normalization and conflict detection to ensure stability across runs.
 *
 * Respects include/exclude patterns from config and .gitignore rules.
 *
 * @returns Plugin ready for discover stage
 *
 * @example
 * ```ts
 * import { discoverFiles } from "@svartz/plugins";
 *
 * const plugin = discoverFiles();
 * runner.execute([plugin], config);
 * // Result: ctx.files contains all discovered files with slugs
 * ```
 *
 * @throws PluginValidationError if plugin validation fails (should not happen)
 *
 * @see {@link plugin-internals-slug} for slug generation algorithm
 * @see {@link plugin-internals-ignore} for .gitignore and pattern matching
 */
export function discoverFiles(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:discover-files",
    discover: (ctx) => {
      // Implementation
    },
  }));
}
````

## Hook Details

### `discover` Hook

Runs during the `discover` stage. Populates `ctx.files` with all discovered files.

**Behavior:**

1. Read `ctx.vaultConfig.include` and `exclude` patterns
2. Traverse vault directory using globs/ignore rules
3. For each `.md` file:
   - Read file contents
   - Parse frontmatter YAML → `frontmatter` property
   - Extract raw markdown → `content` property
   - Generate slug → `slug` property (stable, deterministic)
4. Create `ProcessedFile` entry
5. Append to `ctx.files`

**Postcondition:** `ctx.files` has all files with:

- `path` — relative path from vault root
- `slug` — canonical, conflict-free slug
- `content` — raw markdown
- `frontmatter` — parsed YAML dict

**Error handling:**

- File read errors are collected (non-fatal, unless caught during slug conflict detection)
- Invalid YAML in frontmatter → logged as warning, frontmatter set to `{}`

## Slug Generation Algorithm

See [[plugin-internals-slug]] for complete details. Summary:

1. **Normalize path:** `posts/2024/My Note.md` → `posts/2024/my-note`
2. **Detect conflicts:** If two files map to same slug, append parent directory
3. **Deterministic:** Same vault always produces same slugs

**Examples:**

- `docs/intro.md` → slug `docs/intro`
- `notes/Todo.md` + `archive/Todo.md` → slugs `notes/todo`, `archive/todo`
- `projects/web app/readme.md` → slug `projects/web-app/readme`

## Integration

- **Precondition:** `vaultConfig` loaded
- **Postcondition:** `ctx.files` stable with `slug` property set
- **Depends on:** Nothing (runs first in pipeline)
- **Depended by:** All downstream plugins

## Example Output

Given vault:

```
docs/
  intro.md
  getting-started.md
notes/
  2024-01-01-first-note.md
  Archive/
    old-note.md
```

After `discover`, `ctx.files`:

```typescript
[
  {
    path: "docs/intro.md",
    slug: "docs/intro",
    content: "# Intro\nWelcome...",
    frontmatter: { title: "Introduction" },
    published: true,
    // ... other fields
  },
  {
    path: "docs/getting-started.md",
    slug: "docs/getting-started",
    content: "# Getting Started\n...",
    frontmatter: {},
    published: true,
  },
  {
    path: "notes/2024-01-01-first-note.md",
    slug: "notes/2024-01-01-first-note",
    content: "...",
    frontmatter: { date: "2024-01-01" },
    published: true,
  },
  {
    path: "notes/Archive/old-note.md",
    slug: "notes/archive/old-note",
    content: "...",
    frontmatter: {},
    published: true,
  },
];
```

## Configuration Impact

**From `vaultConfig`:**

- `include` — glob patterns to include (default: `["**/*.md"]`)
- `exclude` — glob patterns to exclude (default: `["node_modules/**", ".git/**"]`)
- `frontmatterFields` — defines which frontmatter keys to extract

**From `config.defaults.vaultConfig`:**

- Same fields propagate to all vaults unless overridden

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/utilities#Slug Generation]] — Slug generation and conflict detection
- [[plugins/utilities#Gitignore Parsing]] — Pattern matching and .gitignore parsing
- [[plugins/filter-unpublished]] — Downstream filtering stage

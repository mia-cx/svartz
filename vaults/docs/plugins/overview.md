# Core Plugins Overview

Reference guide to all 12 core plugins in `@svartz/plugins`, organized by stage.

## Quick Reference

| Plugin ID                    | Stage             | Purpose                                           | Key Function             |
| ---------------------------- | ----------------- | ------------------------------------------------- | ------------------------ |
| `core:discover-files`        | discover          | Traverse vault, parse frontmatter, generate slugs | `discoverFiles()`        |
| `core:filter-unpublished`    | filterUnpublished | Remove draft/unpublished files                    | `filterUnpublished()`    |
| `core:transform-ofm`         | transformContent  | Parse Obsidian-specific markdown features         | `transformOfm()`         |
| `core:transform-gfm`         | transformContent  | GitHub Flavored Markdown processing               | `transformGfm()`         |
| `core:transform-syntax`      | transformContent  | Prepare for syntax highlighting                   | `transformSyntax()`      |
| `core:transform-latex`       | transformContent  | LaTeX/math block handling                         | `transformLatex()`       |
| `core:transform-description` | indexContent      | Extract first 1-3 sentences                       | `transformDescription()` |
| `core:index-content`         | indexContent      | Build search index + manifest                     | `indexContent()`         |
| `core:resolve-links`         | resolveLinks      | Resolve wikilinks (stub)                          | `resolveLinks()`         |
| `core:emit-artifacts`        | emit              | Write index.json, graph, backlinks                | `emitArtifacts()`        |

---

## Stages Breakdown

### Stage 1: Discover

**Plugin:** [[discover-files]]

Vault traversal, file discovery, frontmatter parsing, slug generation.

---

### Stage 2: Filter Unpublished

**Plugin:** [[filter-unpublished]]

Remove files marked as draft or unpublished based on frontmatter fields.

**Function signature:**

```typescript
export function filterUnpublished(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:filter-unpublished",
    filterUnpublished: {
      run: (ctx) => {
        /* filter implementation */
      },
      options: { fatal: false, enforce: "post" },
    },
  }));
}
```

**Behavior:**

- Reads `publishedField` from config (default: `"published"`)
- Removes files where `frontmatter[publishedField]` is falsy or missing
- Modifies `ctx.files` in-place (removes items)

---

### Stage 3: Transform Content (Parallel)

**Plugins:**

- [[transform-ofm]] — Obsidian Flavored Markdown
- [[transform-gfm]] — GitHub Flavored Markdown
- [[transform-syntax]] — Syntax highlighting prep
- [[plugin-transform-latex]] — LaTeX/math

**Enforce:** `default` (can run in parallel)

These plugins transform markdown content independently, modifying `file.content` in-place.

**Example: transformGfm**

````typescript
/**
 * Transform GFM (GitHub Flavored Markdown) features.
 *
 * @description
 * Process GitHub Flavored Markdown syntax including:
 * - Tables
 * - Strikethrough
 * - Task lists
 * - Autolinks
 *
 * @returns Plugin for transformContent stage
 *
 * @example
 * ```ts
 * const plugin = transformGfm();
 * // Transforms: | col1 | col2 | → HTML table
 * ```
 */
export function transformGfm(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-gfm",
    transformContent: (ctx) => {
      // Transform each file's content
      ctx.files.forEach((file) => {
        file.content = processGfm(file.content);
      });
    },
  }));
}
````

---

### Stage 4: Index Content

**Plugins:**

- [[transform-description]] — Extract description
- [[index-content]] — Build index + manifest

**Purpose:** Extract metadata and build search index.

**Example: transformDescription**

````typescript
/**
 * Extract description (first 1-3 sentences) from note content.
 *
 * @description
 * Parses markdown content, extracts first paragraph, and stores
 * first 1-3 sentences as `file.description` property.
 * Used for previews and search result snippets.
 *
 * @returns Plugin for indexContent stage
 *
 * @example
 * ```ts
 * const plugin = transformDescription();
 * // Content: "# Title\n\nFirst sentence. Second sentence. Third."
 * // Result: file.description = "First sentence. Second sentence. Third."
 * ```
 */
export function transformDescription(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:transform-description",
    indexContent: (ctx) => {
      ctx.files.forEach((file) => {
        file.description = extractDescription(file.content);
      });
    },
  }));
}
````

**Example: indexContent**

````typescript
/**
 * Build search index and manifest from processed files.
 *
 * @description
 * Aggregates all ProcessedFile entries into:
 * - Search index (title + description for full-text search)
 * - Manifest (metadata: title, slug, date, tags)
 *
 * Stored in-memory for emit stage to write to disk.
 *
 * @returns Plugin for indexContent stage
 *
 * @example
 * ```ts
 * const plugin = indexContent();
 * // Result: ctx.artifacts.index populated
 * ```
 */
export function indexContent(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:index-content",
    indexContent: (ctx) => {
      const index = ctx.files.map((file) => ({
        slug: file.slug,
        title: file.frontmatter.title || file.slug,
        description: file.description,
        tags: file.frontmatter.tags || [],
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));
      ctx.artifacts = { ...ctx.artifacts, index };
    },
  }));
}
````

---

### Stage 5: Resolve Links

**Plugin:** [[resolve-links]] (stub)

**Precondition:** `discover` completed with stable slugs

Resolves wikilinks to their final slugs. Currently a stub; themes/consumers can add custom resolvers.

````typescript
/**
 * Resolve wikilinks to canonical slugs (stub).
 *
 * @description
 * Placeholder for wikilink resolution. The runner dispatches file changes
 * here for hot reload in dev mode. Custom themes may add resolvers.
 *
 * @returns Plugin for resolveLinks stage
 *
 * @example
 * ```ts
 * const plugin = resolveLinks();
 * // Currently: no-op (intentional stub for future extension)
 * ```
 */
export function resolveLinks(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:resolve-links",
    resolveLinks: (ctx) => {
      // Stub: theme/consumer plugins can hook here to resolve wikilinks
    },
  }));
}
````

---

### Stage 6: Emit

**Plugin:** [[emit-artifacts]]

Writes final artifacts to disk.

**Example:**

````typescript
/**
 * Emit artifacts (index.json, graph, backlinks) to disk.
 *
 * @description
 * Writes in-memory artifacts accumulated by previous stages:
 * - index.json — search index + manifest
 * - graph.json — link graph
 * - backlinks.json — reverse link index
 *
 * Artifacts are written to `.svartz/generated/` or configured output dir.
 *
 * @returns Plugin for emit stage
 *
 * @example
 * ```ts
 * const plugin = emitArtifacts();
 * // Result: files written to disk
 * ```
 */
export function emitArtifacts(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:emit-artifacts",
    emit: (ctx) => {
      const outputDir = ctx.vaultConfig.outDir || ".svartz/generated";
      writeJson(`${outputDir}/index.json`, ctx.artifacts.index);
      writeJson(`${outputDir}/graph.json`, ctx.artifacts.graph);
      writeJson(`${outputDir}/backlinks.json`, ctx.artifacts.backlinks);
    },
  }));
}
````

---

## All Plugins by ID

### Discover Stage

- **`core:discover-files`** [[plugins/discover-files]]

### Filter Unpublished Stage

- **`core:filter-unpublished`** [[plugins/filter-unpublished]]

### Transform Content Stage (4 plugins, can run in parallel)

- **`core:transform-gfm`** [[plugins/transform-gfm]] — GitHub Flavored Markdown
- **`core:transform-ofm`** [[plugins/transform-ofm]] — Obsidian Flavored Markdown
- **`core:transform-syntax`** [[plugins/transform-syntax]] — Syntax highlighting prep
- **`core:transform-latex`** [[plugins/transform-latex]] — LaTeX/math blocks

### Index Content Stage (2 plugins)

- **`core:transform-description`** [[plugins/transform-description]] — Extract summaries
- **`core:index-content`** [[plugins/index-content]] — Build search index

### Resolve Links Stage

- **`core:resolve-links`** [[plugins/resolve-links]] — Wikilink resolution (stub)

### Emit Stage

- **`core:emit-artifacts`** [[plugins/emit-artifacts]] — Write artifacts

---

## Initialization

All plugins are created via factory functions. Core plugins are automatically included:

```typescript
import {
  discoverFiles,
  filterUnpublished,
  transformOfm,
  transformGfm,
  transformSyntax,
  transformLatex,
  transformDescription,
  indexContent,
  resolveLinks,
  emitArtifacts,
  createCorePlugins,
} from "@svartz/plugins";

// Manual initialization
const plugins = [
  discoverFiles(),
  filterUnpublished(),
  transformGfm(),
  // ... etc
];

// Or use helper
const corePlugins = createCorePlugins();
```

---

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- `plugins/utilities` — mergePlugins, sortPluginsForStage, etc.
- [[plugins/utilities/slug]] — Slug generation algorithm
- [[plugins/utilities/ignore]] — Gitignore pattern matching

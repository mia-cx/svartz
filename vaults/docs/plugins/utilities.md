# Plugin Utilities & Internals

Reference for utility functions and internal modules used across `@svartz/plugins`.

## Utilities (Public API)

### `normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin`

Validates and normalizes a plugin to standard form. See [[contracts/plugin-contract#Utility Functions]].

```typescript
/**
 * Validate and normalize a plugin to standard form.
 *
 * @description
 * Validates plugin structure and converts shorthand hooks (functions)
 * to explicit HookObject form with options. Warns about unknown keys.
 *
 * @param plugin - Raw plugin object
 * @returns Normalized plugin with all hooks as explicit objects
 *
 * @throws PluginValidationError if validation fails
 *
 * @example
 * ```ts
 * const raw = { id: "my:plugin", discover: (ctx) => { /* ... */ } };
 * const normalized = normalizePlugin(raw);
 * // normalized.discover === { run: (...), options: { fatal: false, ... } }
 * ```
 */
export function normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin {
  // Implementation in packages/core/src/plugin/utils.ts
}
```

---

### `sortPluginsForStage(plugins: SvartzPlugin[], stage: string): SvartzPlugin[]`

Sorts plugins by `enforce` level for a stage. See [[contracts/plugin-contract#Utility Functions]].

````typescript
/**
 * Sort plugins for a given stage based on enforce level.
 *
 * @description
 * Returns plugins in order: pre (serial) → default (parallel) → post (serial).
 * Preserves order within each enforce level.
 *
 * @param plugins - Array of plugins
 * @param stage - Stage name (discover, transformContent, etc.)
 * @returns Sorted plugin array
 *
 * @example
 * ```ts
 * const plugins = [
 *   { id: "a", transformContent: { run: ..., options: { enforce: "post" } } },
 *   { id: "b", transformContent: (ctx) => { } }, // default
 *   { id: "c", transformContent: { run: ..., options: { enforce: "pre" } } }
 * ];
 * const sorted = sortPluginsForStage(plugins, "transformContent");
 * // sorted === [c (pre), b (default), a (post)]
 * ```
 */
export function sortPluginsForStage(
  plugins: SvartzPlugin[],
  stage: string,
): SvartzPlugin[] {
  // Implementation in packages/core/src/plugin/utils.ts
}
````

---

### `mergePlugins(layers: SvartzPlugin[][]): SvartzPlugin[]`

Merges plugins from 4 layers with specificity-based conflict resolution. See [[contracts/plugin-contract#Utility Functions]].

````typescript
/**
 * Merge plugins from multiple layers with conflict resolution.
 *
 * @description
 * Applies 4-layer merge:
 * 1. Core plugins
 * 2. Theme plugin preset
 * 3. Config defaults plugins
 * 4. Config vault plugins
 *
 * Duplicate IDs are resolved by layer specificity (vault > defaults > theme > core).
 * Unknown plugins append to the list.
 *
 * @param layers - Array of plugin arrays [core, theme, defaults, vault]
 * @returns Merged list with duplicates resolved by specificity
 *
 * @example
 * ```ts
 * const core = [{ id: "core:discover", ... }];
 * const theme = [{ id: "custom:highlight", ... }];
 * const defaults = [{ id: "core:discover", /* override */ }];
 * const vault = [{ id: "core:discover", /* vault-specific */ }];
 *
 * const merged = mergePlugins([core, theme, defaults, vault]);
 * // Result: one core:discover (vault's version), plus custom:highlight
 * ```
 */
export function mergePlugins(layers: SvartzPlugin[][]): SvartzPlugin[] {
  // Implementation in packages/core/src/plugin/merge.ts
}
````

---

## Internal Utilities

### Slug Generation (`@svartz/plugins/internal/slug.ts`)

Generates canonical, deterministic, conflict-free slugs for vault files.

````typescript
/**
 * Generate canonical slug from file path.
 *
 * @description
 * Normalizes path to slug:
 * - Lowercase
 * - Replace spaces/punctuation with hyphens
 * - Remove extensions
 * - Preserve directory structure
 *
 * Example: `Docs/My Note.md` → `docs/my-note`
 *
 * @param filePath - Relative path from vault root (e.g., "docs/note.md")
 * @returns Canonical slug (e.g., "docs/note")
 *
 * @example
 * ```ts
 * import { generateSlug } from "@svartz/plugins/internal/slug";
 *
 * generateSlug("docs/Getting Started.md") // "docs/getting-started"
 * generateSlug("notes/2024-01-01.md") // "notes/2024-01-01"
 * ```
 */
export function generateSlug(filePath: string): string {
  // Implementation
}

/**
 * Detect slug conflicts and resolve via parent directory.
 *
 * @description
 * Given multiple files mapping to the same slug, disambiguate by
 * including more of the path. Ensures stable, unique slugs.
 *
 * @param files - ProcessedFile[] with tentative slugs
 * @returns Files with resolved, unique slugs
 *
 * @example
 * ```ts
 * const files = [
 *   { path: "notes/Todo.md", slug: "todo" },
 *   { path: "archive/Todo.md", slug: "todo" }
 * ];
 * const resolved = resolveSlugConflicts(files);
 * // Result:
 * // { path: "notes/Todo.md", slug: "notes/todo" },
 * // { path: "archive/Todo.md", slug: "archive/todo" }
 * ```
 */
export function resolveSlugConflicts(files: ProcessedFile[]): ProcessedFile[] {
  // Implementation
}
````

**See:** [[plugins/discover-files]] for integration

---

### Gitignore Parsing (`@svartz/plugins/internal/ignore.ts`)

Parses `.gitignore` and config patterns for file filtering.

````typescript
/**
 * Create ignore matcher from .gitignore and patterns.
 *
 * @description
 * Reads .gitignore file from vault root and merges with
 * include/exclude patterns from config. Returns predicate function.
 *
 * @param vaultPath - Vault directory path
 * @param include - Include patterns (default: ["**\/*.md"])
 * @param exclude - Exclude patterns (default: ["node_modules/**", ".git/**"])
 * @returns Predicate: (filePath) => boolean (true if file should be included)
 *
 * @example
 * ```ts
 * import { createIgnoreMatcher } from "@svartz/plugins/internal/ignore";
 *
 * const shouldInclude = createIgnoreMatcher("/path/to/vault", ["**\/*.md"], ["drafts/**"]);
 * shouldInclude("docs/note.md") // true
 * shouldInclude("drafts/wip.md") // false
 * shouldInclude(".git/config") // false (from .gitignore)
 * ```
 */
export function createIgnoreMatcher(
  vaultPath: string,
  include: string[],
  exclude: string[],
): (filePath: string) => boolean {
  // Implementation
}
````

---

### Datetime Utilities (`@svartz/plugins/internal/datetime.ts`)

ISO timestamp parsing and formatting.

````typescript
/**
 * Parse datetime string to ISO format.
 *
 * @description
 * Converts various formats (timestamps, date strings) to ISO 8601.
 * Returns undefined if unparseable.
 *
 * @param input - Date string or timestamp
 * @returns ISO 8601 string or undefined
 *
 * @example
 * ```ts
 * import { toISOString } from "@svartz/plugins/internal/datetime";
 *
 * toISOString("2024-01-15") // "2024-01-15T00:00:00Z"
 * toISOString("2024-01-15T10:30:00Z") // "2024-01-15T10:30:00Z"
 * toISOString("invalid") // undefined
 * ```
 */
export function toISOString(input: unknown): string | undefined {
  // Implementation
}

/**
 * Extract ISO date from file modification time (fs.stat).
 *
 * @param stats - fs.Stats object from file system
 * @returns ISO 8601 string
 *
 * @example
 * ```ts
 * const stats = await fs.promises.stat("/path/to/file.md");
 * const modTime = fileStatsToISO(stats); // "2024-01-15T10:30:00Z"
 * ```
 */
export function fileStatsToISO(stats: fs.Stats): string {
  // Implementation
}
````

---

### Frontmatter Parsing (`@svartz/plugins/internal/parse.ts`)

YAML frontmatter extraction and parsing.

````typescript
/**
 * Parse YAML frontmatter from markdown content.
 *
 * @description
 * Extracts YAML between `---` delimiters at file start.
 * Returns parsed object and remaining content.
 *
 * @param content - Raw markdown content
 * @returns { frontmatter: Record<string, unknown>, content: string }
 *
 * @example
 * ```ts
 * import { parseFrontmatter } from "@svartz/plugins/internal/parse";
 *
 * const raw = \`---
 * title: My Note
 * tags: [learning, svartz]
 * ---
 * # Content here\`;
 *
 * const { frontmatter, content } = parseFrontmatter(raw);
 * // frontmatter = { title: "My Note", tags: ["learning", "svartz"] }
 * // content = "# Content here"
 * ```
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  // Implementation
}

/**
 * Get value from frontmatter by field name.
 *
 * @description
 * Safely extracts field from frontmatter. Returns undefined if missing.
 *
 * @param frontmatter - Frontmatter object
 * @param fieldName - Field key to extract
 * @returns Field value or undefined
 *
 * @example
 * ```ts
 * const fm = { title: "Note", publish: true };
 * getFrontmatterField(fm, "title") // "Note"
 * getFrontmatterField(fm, "notfound") // undefined
 * ```
 */
export function getFrontmatterField(
  frontmatter: Record<string, unknown>,
  fieldName: string,
): unknown {
  // Implementation
}
````

---

### Link Resolution (`@svartz/plugins/internal/resolve.ts`)

Wikilink parsing and resolution helpers.

````typescript
/**
 * Parse wikilinks from markdown content.
 *
 * @description
 * Extracts all `[[link]]` and `[[link|display]]` patterns.
 * Returns array of link targets.
 *
 * @param content - Markdown content
 * @returns Array of RawLink objects
 *
 * @example
 * ```ts
 * import { parseWikilinks } from "@svartz/plugins/internal/resolve";
 *
 * const content = \`
 * Check out [[getting-started]] and [[faq|FAQ]].
 * Also see [[archive/old-note]].
 * \`;
 *
 * const links = parseWikilinks(content);
 * // [
 * //   { target: "getting-started", display: "getting-started" },
 * //   { target: "faq", display: "FAQ" },
 * //   { target: "archive/old-note", display: "archive/old-note" }
 * // ]
 * ```
 */
export function parseWikilinks(content: string): RawLink[] {
  // Implementation
}

/**
 * Resolve wikilink target to canonical slug.
 *
 * @description
 * Given a wikilink target and resolution strategy (closest, absolute, shallowest),
 * finds the matching file slug.
 *
 * @param target - Wikilink target (e.g., "getting-started", "archive/note")
 * @param files - All ProcessedFile[] with slugs
 * @param strategy - Resolution strategy (closest, shallowest, absolute)
 * @returns Resolved slug or undefined if not found
 *
 * @example
 * ```ts
 * const files = [
 *   { slug: "docs/getting-started", ... },
 *   { slug: "archive/getting-started", ... }
 * ];
 * resolveWikilink("getting-started", files, "closest")
 * // Returns: "docs/getting-started" (same directory context)
 * ```
 */
export function resolveWikilink(
  target: string,
  files: ProcessedFile[],
  strategy: "closest" | "shallowest" | "absolute",
): string | undefined {
  // Implementation
}
````

---

## See Also

- [[plugins/overview]] — All core plugins reference
- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/discover-files]] — Uses slug + ignore utilities

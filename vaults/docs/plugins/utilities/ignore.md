# Gitignore Parsing

Parses `.gitignore` and config include/exclude patterns for file filtering.

**Source:** `@svartz/plugins/internal/ignore.ts`

## createIgnoreMatcher

```typescript
export function createIgnoreMatcher(
  vaultPath: string,
  include: string[],
  exclude: string[]
): (filePath: string) => boolean
```

Reads `.gitignore` from vault root and merges with include/exclude patterns from config. Returns a predicate: **true** if the file path should be **included**.

## Parameters

- **vaultPath** — Vault directory path (absolute or relative)
- **include** — Glob patterns to include (e.g. `["**/*.md"]`)
- **exclude** — Glob patterns to exclude (e.g. `["node_modules/**", ".git/**"]`)

## Returns

Function `(filePath: string) => boolean` — `true` if file should be included in traversal.

## Example

```typescript
import { createIgnoreMatcher } from "@svartz/plugins/internal/ignore";

const shouldInclude = createIgnoreMatcher(
  "/path/to/vault",
  ["**/*.md"],
  ["drafts/**"]
);
shouldInclude("docs/note.md");   // true
shouldInclude("drafts/wip.md"); // false
shouldInclude(".git/config");   // false (from .gitignore)
```

## See Also

- [[plugins/discover-files]] — Uses ignore matcher during traversal
- [[plugins/utilities/slug]] — Slug generation after filtering
- [[guides/setup-config]] — Config include/exclude patterns

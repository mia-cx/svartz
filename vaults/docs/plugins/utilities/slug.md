# Slug Generation

Generates canonical, deterministic, conflict-free slugs for vault files.

**Source:** `@svartz/plugins/internal/slug.ts`

## generateSlug

```typescript
export function generateSlug(filePath: string): string
```

Normalizes path to slug: lowercase, replace spaces/punctuation with hyphens, remove extensions, preserve directory structure.

**Example:** `Docs/My Note.md` → `docs/my-note`

### Example

```typescript
import { generateSlug } from "@svartz/plugins/internal/slug";

generateSlug("docs/Getting Started.md"); // "docs/getting-started"
generateSlug("notes/2024-01-01.md");     // "notes/2024-01-01"
```

---

## resolveSlugConflicts

```typescript
export function resolveSlugConflicts(files: ProcessedFile[]): ProcessedFile[]
```

Given multiple files mapping to the same slug, disambiguates by including more of the path. Ensures stable, unique slugs.

### Example

```typescript
const files = [
  { path: "notes/Todo.md", slug: "todo" },
  { path: "archive/Todo.md", slug: "todo" }
];
const resolved = resolveSlugConflicts(files);
// Result:
// { path: "notes/Todo.md", slug: "notes/todo" },
// { path: "archive/Todo.md", slug: "archive/todo" }
```

## See Also

- [[plugins/discover-files]] — Uses slug generation during discovery
- [[plugins/utilities/ignore]] — File filtering before slug generation
- [[contracts/plugin-contract]] — ProcessedFile and slug stability

# Frontmatter Parsing

YAML frontmatter extraction and parsing.

**Source:** `@svartz/plugins/internal/parse.ts`

## parseFrontmatter

```typescript
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  content: string;
}
```

Extracts YAML between `---` delimiters at file start. Returns parsed object and remaining markdown content.

### Example

```typescript
import { parseFrontmatter } from "@svartz/plugins/internal/parse";

const raw = `---
title: My Note
tags: [learning, svartz]
---
# Content here`;

const { frontmatter, content } = parseFrontmatter(raw);
// frontmatter = { title: "My Note", tags: ["learning", "svartz"] }
// content = "# Content here"
```

---

## getFrontmatterField

```typescript
export function getFrontmatterField(
  frontmatter: Record<string, unknown>,
  fieldName: string
): unknown
```

Safely extracts a field from frontmatter. Returns `undefined` if missing.

### Example

```typescript
const fm = { title: "Note", publish: true };
getFrontmatterField(fm, "title");    // "Note"
getFrontmatterField(fm, "notfound"); // undefined
```

## See Also

- [[plugins/discover-files]] — Uses parseFrontmatter during discovery
- [[plugins/filter-unpublished]] — Uses frontmatter for published field
- [[contracts/config-contract]] — Frontmatter field configuration

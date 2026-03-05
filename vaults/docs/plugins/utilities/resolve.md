# Link Resolution

Wikilink parsing and resolution helpers.

**Source:** `@svartz/plugins/internal/resolve.ts`

## parseWikilinks

```typescript
export function parseWikilinks(content: string): RawLink[]
```

Extracts all `[[link]]` and `[[link|display]]` patterns from markdown. Returns array of link targets.

### Example

```typescript
import { parseWikilinks } from "@svartz/plugins/internal/resolve";

const content = `
Check out [[getting-started]] and [[faq|FAQ]].
Also see [[archive/old-note]].
`;

const links = parseWikilinks(content);
// [
//   { target: "getting-started", display: "getting-started" },
//   { target: "faq", display: "FAQ" },
//   { target: "archive/old-note", display: "archive/old-note" }
// ]
```

---

## resolveWikilink

```typescript
export function resolveWikilink(
  target: string,
  files: ProcessedFile[],
  strategy: "closest" | "shallowest" | "absolute"
): string | undefined
```

Resolves a wikilink target to a canonical slug using the given strategy. Returns `undefined` if not found.

### Parameters

- **target** — Wikilink target (e.g. `"getting-started"`, `"archive/note"`)
- **files** — All `ProcessedFile[]` with slugs
- **strategy** — `closest` (same directory context), `shallowest`, or `absolute`

### Example

```typescript
const files = [
  { slug: "docs/getting-started", ... },
  { slug: "archive/getting-started", ... }
];
resolveWikilink("getting-started", files, "closest");
// Returns: "docs/getting-started" (same directory context)
```

## See Also

- [[plugins/resolve-links]] — Stage that uses link resolution (stub)
- [[plugins/utilities/slug]] — Slug stability required for resolution
- [[contracts/plugin-contract]] — RawLink and ProcessedFile types

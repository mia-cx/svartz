# Datetime Utilities

ISO timestamp parsing and formatting for vault metadata.

**Source:** `@svartz/plugins/internal/datetime.ts`

## toISOString

```typescript
export function toISOString(input: unknown): string | undefined
```

Converts various formats (timestamps, date strings) to ISO 8601. Returns `undefined` if unparseable.

### Example

```typescript
import { toISOString } from "@svartz/plugins/internal/datetime";

toISOString("2024-01-15");              // "2024-01-15T00:00:00Z"
toISOString("2024-01-15T10:30:00Z");    // "2024-01-15T10:30:00Z"
toISOString("invalid");                 // undefined
```

---

## fileStatsToISO

```typescript
export function fileStatsToISO(stats: fs.Stats): string
```

Extracts ISO 8601 string from file modification time (`fs.stat`).

### Example

```typescript
const stats = await fs.promises.stat("/path/to/file.md");
const modTime = fileStatsToISO(stats); // "2024-01-15T10:30:00Z"
```

## See Also

- [[plugins/discover-files]] — Uses datetime for file metadata
- [[contracts/config-contract]] — Frontmatter date fields (createdAtField, updatedAtField)

# sortPluginsForStage

Sorts plugins for a given stage based on `enforce` level.

**Source:** `@svartz/core` — `packages/core/src/plugin/utils.ts`

See [[contracts/plugin-contract#Utility Functions]] for contract details.

## Signature

```typescript
export function sortPluginsForStage(
  plugins: SvartzPlugin[],
  stage: string
): SvartzPlugin[]
```

## Description

Returns plugins in order: **pre** (serial) → **default** (parallel) → **post** (serial). Preserves order within each enforce level.

## Parameters

- **plugins** — Array of (normalized) plugins
- **stage** — Stage name (`discover`, `transformContent`, etc.)

## Returns

Sorted plugin array ready for stage execution.

## Example

```typescript
import { sortPluginsForStage } from "@svartz/core";

const plugins = [
  { id: "a", transformContent: { run: (...), options: { enforce: "post" } } },
  { id: "b", transformContent: (ctx) => { } }, // default
  { id: "c", transformContent: { run: (...), options: { enforce: "pre" } } }
];
const sorted = sortPluginsForStage(plugins, "transformContent");
// sorted === [c (pre), b (default), a (post)]
```

## See Also

- [[plugins/utilities/normalize-plugin]] — Normalize before sorting
- [[plugins/utilities/merge-plugins]] — Merge before sorting
- [[contracts/plugin-contract]] — Enforce levels and stages

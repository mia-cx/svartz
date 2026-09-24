# sortPluginsForStage

Sorts plugins for a given stage based on `enforce` level.

**Source:** `@svartz/core` — `packages/core/src/plugin/utils.ts`

See [[contracts/plugin-contract]] for contract details.

## Signature

```typescript
export function sortPluginsForStage(
  plugins: SvartzPlugin[],
  stage: string
): SvartzPlugin[]
```

## Description

Returns plugins in order: **pre** → **default** → **post**. Preserves order within each enforce level. Content transform hooks run serially.

## Parameters

- **plugins** — Array of (normalized) plugins
- **stage** — Stage name (`discoverFiles`, `transformGfm`, etc.)

## Returns

Sorted plugin array ready for stage execution.

## Example

```typescript
import { sortPluginsForStage } from "@svartz/core";

const plugins = [
  { id: "a", transformGfm: { run: (ctx) => {}, options: { enforce: "post" } } },
  { id: "b", transformGfm: (ctx) => {} },
  { id: "c", transformGfm: { run: (ctx) => {}, options: { enforce: "pre" } } }
];
const sorted = sortPluginsForStage(plugins, "transformGfm");
// sorted === [c (pre), b (default), a (post)]
```

## See Also

- [[plugins/utilities/normalize-plugin]] — Normalize before sorting
- [[plugins/utilities/merge-plugins]] — Merge before sorting
- [[contracts/plugin-contract]] — Enforce levels and stages

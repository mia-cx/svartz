# mergePlugins

Merges plugins from multiple layers with specificity-based conflict resolution.

**Source:** `@svartz/core` — `packages/core/src/plugin/merge.ts`

See [[contracts/plugin-contract#Utility Functions]] for contract details.

## Signature

```typescript
export function mergePlugins(layers: SvartzPlugin[][]): SvartzPlugin[]
```

## Description

Applies 4-layer merge in order:

1. Core plugins  
2. Theme plugin preset  
3. Config defaults plugins  
4. Config vault plugins  

Duplicate IDs are resolved by layer specificity (vault > defaults > theme > core). New IDs append to the list.

## Parameters

- **layers** — Array of plugin arrays `[core, theme, defaults, vault]`

## Returns

Merged list with duplicates resolved by specificity; deterministic order.

## Example

```typescript
import { mergePlugins } from "@svartz/core";

const core = [{ id: "core:discover", ... }];
const theme = [{ id: "custom:highlight", ... }];
const defaults = [{ id: "core:discover", ...override }];
const vault = [{ id: "core:discover", ...vault-specific }];

const merged = mergePlugins([core, theme, defaults, vault]);
// Result: one core:discover (vault's version), plus custom:highlight
```

## See Also

- [[plugins/utilities/normalize-plugin]] — Normalize after merge
- [[plugins/utilities/sort-plugins-for-stage]] — Sort merged list per stage
- [[contracts/plugin-contract]] — Merge order and conflict rules

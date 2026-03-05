# normalizePlugin

Validates and normalizes a plugin to standard form.

**Source:** `@svartz/core` — `packages/core/src/plugin/utils.ts`

See [[contracts/plugin-contract#Utility Functions]] for contract details.

## Signature

```typescript
export function normalizePlugin(plugin: SvartzPlugin): NormalizedSvartzPlugin
```

## Description

Validates plugin structure and converts shorthand hooks (functions) to explicit HookObject form with options. Warns about unknown keys via `console.warn`.

## Parameters

- **plugin** — Raw plugin object (author-facing `SvartzPlugin`)

## Returns

Normalized plugin with all hooks as explicit `{ run, options? }` objects.

## Throws

`PluginValidationError` if validation fails (e.g. missing or invalid `id`, invalid hook shape).

## Example

```typescript
import { normalizePlugin } from "@svartz/core";

const raw = { id: "my:plugin", discover: (ctx) => { /* ... */ } };
const normalized = normalizePlugin(raw);
// normalized.discover === { run: (...), options: { fatal: false, ... } }
```

## See Also

- [[plugins/utilities/sort-plugins-for-stage]] — Sort normalized plugins for a stage
- [[plugins/utilities/merge-plugins]] — Merge plugin layers
- [[contracts/plugin-contract]] — Full plugin contract

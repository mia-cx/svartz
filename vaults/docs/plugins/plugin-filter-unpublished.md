# Plugin: Filter Unpublished

Core pipeline plugin for removing draft/unpublished files from the pipeline.

## Overview

**Plugin ID:** `core:filter-unpublished`  
**Stage:** `filterUnpublished`  
**Enforce:** `post` (runs after frontmatter parsing)  
**Fatal:** `true` (errors stop pipeline)

Filters out files marked as draft or unpublished based on the `publishedField` from configuration. Uses deterministic publication semantics: missing field or falsy value = draft.

## Purpose

Remove files that should not be published before downstream processing. This reduces computational waste on draft content and ensures only published files appear in final artifacts.

## Function Signature

```typescript
/**
 * Create a filter plugin to remove unpublished files.
 *
 * @description
 * Filters `ctx.files` based on the `publishedField` from vault config.
 * A file is considered **unpublished** if:
 * - The publishedField is missing from frontmatter, OR
 * - The field value is falsy (false, null, undefined, empty string)
 *
 * Any other value (including datetime strings, truthy numbers) = published.
 *
 * Runs in post-enforce phase after frontmatter parsing is complete.
 *
 * @returns Plugin ready for filterUnpublished stage
 *
 * @example
 * ```ts
 * import { filterUnpublished } from "@svartz/plugins";
 *
 * const plugin = filterUnpublished();
 * runner.execute([plugin], config);
 * // Result: ctx.files contains only published files
 * ```
 *
 * @throws PluginValidationError if plugin validation fails
 */
export function filterUnpublished(): SvartzPlugin {
  return definePlugin(() => ({
    id: "core:filter-unpublished",
    filterUnpublished: {
      run: (ctx) => {
        // Implementation
      },
      options: { fatal: true, enforce: "post" }
    }
  }));
}
```

## Hook Details

### `filterUnpublished` Hook

Runs during the `filterUnpublished` stage. Mutates `ctx.files` by removing unpublished entries.

**Behavior:**
1. Read `publishedField` from `ctx.vaultConfig.frontmatterFields` (default: `"published"`)
2. Iterate through `ctx.files`
3. For each file, check `file.frontmatter[publishedField]`
4. Remove file if:
   - Field is undefined/null → draft
   - Field is false → draft
   - Field is empty string `""` → draft
5. Keep file if:
   - Field is true → published
   - Field is any datetime string → published
   - Field is any truthy value → published

**Postcondition:** `ctx.files` contains only published files

**Error handling:**
- Validation errors are fatal (stop pipeline)
- Non-validation errors are collected (continue)

## Publication Semantics

**A file is PUBLISHED if:**
- `publishedField` exists in frontmatter AND its value is truthy

**A file is DRAFT (removed) if:**
- `publishedField` is missing, OR
- `publishedField` is falsy (false, null, undefined, empty string)

**Examples:**

```yaml
---
title: Published Note
published: true
---
✓ PUBLISHED (field is true)

---
title: Another Published Note
published: "2024-01-15T10:00:00Z"
---
✓ PUBLISHED (datetime string is truthy)

---
title: Draft Note
published: false
---
✗ DRAFT (field is false)

---
title: Another Draft
---
✗ DRAFT (field is missing)

---
title: Empty String Draft
published: ""
---
✗ DRAFT (field is empty string, falsy)
```

## Configuration Impact

**From `vaultConfig.frontmatterFields`:**
- `publishedField` — which frontmatter key to check (default: `"published"`)

**Per-vault override:**
```typescript
vaults: {
  docs: {
    path: "./docs",
    frontmatterFields: {
      publishedField: "draft"  // Note: reversed semantics (draft: true = unpublished)
    }
  }
}
```

In this case, files with `draft: true` would be filtered out.

## Integration

- **Precondition:** `discover` completed (frontmatter parsed)
- **Postcondition:** `ctx.files` contains only published files
- **Depends on:** Nothing (runs second in pipeline)
- **Depended by:** All downstream plugins (work only with published files)

## Example Behavior

Given vault with files:

```
docs/
  intro.md        → published: true
  guide.md        → published: true
  draft-todo.md   → published: false
  wip.md          → (no published field)
  archived.md     → published: "2023-01-01" (truthy datetime)
```

After `filterUnpublished`, `ctx.files`:
```typescript
[
  { slug: "docs/intro", published: true, /* ... */ },
  { slug: "docs/guide", published: true, /* ... */ },
  { slug: "docs/archived", published: "2023-01-01", /* ... */ }
  // draft-todo.md and wip.md are removed
]
```

## Best Practices

✅ **DO:**
- Use consistent field names across vaults
- Document your publication workflow for content authors
- Test with real vault content
- Use boolean `true`/`false` for clearest semantics

❌ **DON'T:**
- Assume missing field = published (it's the opposite!)
- Use inconsistent field names per-vault without documentation
- Use truthy values other than `true` unless documented

## Troubleshooting

### Drafts Still Appearing

- Check `publishedField` spelling matches your frontmatter
- Remember: **missing field = draft** (not published)
- Verify the plugin is in your plugin list

### All Files Filtered Out

- Check your `publishedField` value in all files
- Ensure files have the correct field with truthy value
- Check for typos in frontmatter key names

---

## See Also

- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/plugins-overview#Stage 2]] — Filter unpublished stage
- [[guides/setup-config#Frontmatter Semantics]] — Publication semantics guide

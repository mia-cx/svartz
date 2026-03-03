# Component resolution: mdsvex + themes + vaults

## Problem

- Vaults live as "cousin" directories to `apps/web` (not self-contained npm modules).
- Vaults should stay simple folders (not require `package.json`, mdsvex install, etc.) to preserve Obsidian "Create new vault" UX.
- mdsvex files in vaults need to import components from themes.
- IntelliSense should work without extra boilerplate.
- Theme is per-vault (config-driven), but `.md` files don't "know" which theme is active at author-time.

## Solution: Option C (direct theme imports, per-vault config)

### Config (per vault)

```ts
// svartz.config.ts
vaults: [
  {
    path: 'vaults/docs',
    theme: 'default',  // ← Specifies which theme this vault uses
    target: { ... },
    ...
  },
  {
    path: 'vaults/notes',
    theme: 'minimal',  // ← Different theme
    target: { ... },
    ...
  },
]
```

### In vault `.md` files

```md
<script>
  import { SidebarLayout, Card } from '@svartz/theme-default';
</script>

# My Doc
<SidebarLayout>
  <Card>Content</Card>
</SidebarLayout>
```

### How it works

1. **CLI orchestrator** reads vault config, sets `process.env.THEME_PACKAGE = '@svartz/theme-default'` during build.
2. **SvelteKit build** processes mdsvex with that theme in scope.
3. **Vite tree-shaking** removes unused components from the final bundle.
4. **Each vault's build artifact** only includes the theme it imported.

### IntelliSense

- ✅ Works out-of-the-box (standard ESM imports)
- ✅ No aliases or special configuration
- ✅ Authors see component completions immediately

### UX for authors

```md
<!-- When switching themes, update the import -->
- import { ... } from '@svartz/theme-default';
+ import { ... } from '@svartz/theme-minimal';
```

If switching themes is common, provide a CLI command to bulk-update imports:

```bash
pnpm svartz theme:migrate --vault docs --from default --to minimal
```

### Downside

**Theme coupling:** `.md` files are coupled to specific theme packages. Switching themes requires import updates.

**Mitigation:** Themes should have similar component exports (same named components). Theme packages document their API. Standard components live in `@svartz/ui` (theme-agnostic).

## Implementation notes

- **`apps/web` dependencies:** Depends on all theme packages used in any vault. `package.json`:
  ```json
  {
    "dependencies": {
      "@svartz/theme-default": "workspace:*",
      "@svartz/theme-minimal": "workspace:*"
    }
  }
  ```
- **Vault folders:** Remain simple; no `package.json` or build config needed.
- **Type safety:** Theme packages export TypeScript types; IDE hints work naturally.

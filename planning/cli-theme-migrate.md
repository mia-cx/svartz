# CLI: Theme migration helper

## Problem

When switching themes per-vault, authors need to update component imports in their `.md` files:

```md
<!-- Old -->
import { SidebarLayout } from '@svartz/themes-default';

<!-- New -->
import { SidebarLayout } from '@svartz/themes-minimal';
```

Manual updates are tedious and error-prone, especially across many files.

## Solution: `pnpm svartz theme:migrate`

### Usage

```bash
pnpm svartz theme:migrate --vault docs --from default --to minimal
```

### How it works

1. **Parse vault:** Walk `vaults/docs/` for all `.md` files.
2. **Extract imports:** Find lines like `import { ... } from '@svartz/themes-<old>'`.
3. **Compare exports:** 
   - Load current theme module (`@svartz/themes-default`)
   - Load target theme module (`@svartz/themes-minimal`)
   - Extract exported component names from each
4. **For each imported component:**
   - **If target exports it (same name):** Swap import path
     ```md
     - import { Card } from '@svartz/themes-default';
     + import { Card } from '@svartz/themes-minimal';
     ```
   - **If target doesn't export it:** 
     - Remove the import statement
     - Comment out all usages of that component (with a note)
     ```md
     <!-- Card no longer available in themes-minimal; consider using Box instead -->
     <!-- <Card>...</Card> -->
     ```
5. **Write back:** Save updated `.md` files.
6. **Report:** Print a summary of changes (imports updated, components commented out, etc.).

### Algorithm

```ts
// packages/cli/src/commands/theme-migrate.ts

async function migrationHelper(vaultPath, fromTheme, toTheme) {
  // 1. Load theme exports
  const fromExports = await getThemeExports(fromTheme);
  const toExports = await getThemeExports(toTheme);
  
  // 2. Walk vault
  const mdFiles = await glob(`${vaultPath}/**/*.md`);
  
  for (const file of mdFiles) {
    let content = await fs.readFile(file, 'utf-8');
    let changed = false;
    
    // 3. Parse imports
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+'@svartz\/themes-[^']+'/g;
    const imports = [...content.matchAll(importRegex)];
    
    for (const match of imports) {
      const components = match[1].split(',').map(s => s.trim());
      const available = components.filter(c => toExports.has(c));
      const unavailable = components.filter(c => !toExports.has(c));
      
      if (available.length > 0) {
        // Update import
        const newImport = `import { ${available.join(', ')} } from '@svartz/themes-${toTheme}'`;
        content = content.replace(match[0], newImport);
        changed = true;
      }
      
      if (unavailable.length > 0) {
        // Remove import + comment out usages
        content = content.replace(match[0], 
          `// ${unavailable.join(', ')} not available in ${toTheme}; commented out`);
        
        for (const comp of unavailable) {
          // Find and comment out <Component> tags
          const tagRegex = new RegExp(`<${comp}[\\s>]`, 'g');
          content = content.replace(tagRegex, `<!-- <${comp} (unavailable in ${toTheme}) `);
          // Close comment after closing tag
          const closeRegex = new RegExp(`</${comp}>`, 'g');
          content = content.replace(closeRegex, `</${comp}> -->`);
        }
        changed = true;
      }
    }
    
    if (changed) {
      await fs.writeFile(file, content, 'utf-8');
      console.log(`✏️ Updated: ${file}`);
    }
  }
}

// Helper: extract exports from theme package
async function getThemeExports(themeName) {
  const pkg = await import(`@svartz/themes-${themeName}`);
  return new Set(Object.keys(pkg));
}
```

### Example

**Before:**

```md
<script>
  import { SidebarLayout, Card, Badge } from '@svartz/themes-default';
</script>

# My Doc
<SidebarLayout>
  <Card>
    <Badge>New</Badge>
    Content
  </Card>
</SidebarLayout>
```

**After migrating to `minimal` (which exports `SidebarLayout` and `Card` but not `Badge`):**

```md
<script>
  import { SidebarLayout, Card } from '@svartz/themes-minimal';
  // Badge not available in minimal; commented out
</script>

# My Doc
<SidebarLayout>
  <Card>
    <!-- <Badge (unavailable in minimal) -->New<!-- </Badge> --> -->
    Content
  </Card>
</SidebarLayout>
```

### Output

```
🔄 Theme migration: default → minimal

✏️ Updated: vaults/docs/index.md
✏️ Updated: vaults/docs/guide/setup.md

📋 Summary:
  • 2 files updated
  • Imports swapped: 5 components
  • Components commented out: 2 (Badge, Tooltip)

⚠️ Review commented sections and replace with equivalents or remove.
```

### Notes

- **Theme exports:** Theme packages must export components via `index.ts` (or similar) so the CLI can introspect them.
- **Manual review:** CLI provides a safety net, but authors should review commented-out sections.
- **Dry-run mode:** Optional `--dry-run` flag to preview changes without writing.
- **Future:** Could suggest replacements ("Did you mean `Box` instead of `Badge`?") if themes provide equivalence hints.

# Theme resolution: Local, absolute, or npm modules

## Strategy

Instead of bundling themes in the CLI, themes are resolved three ways:

1. **Local path** — `./themes/custom` (relative to project root, for custom/internal themes)
2. **Absolute path** — `/absolute/path/to/theme` (full filesystem path)
3. **npm module** — `@svartz/theme-minimal` (installed as dep of `apps/web`)

Config specifies the theme as a string; the CLI resolves it automatically.

## Config examples

```ts
// svartz.config.ts
vaults: [
  {
    path: 'vaults/docs',
    theme: '@svartz/theme-package-docs',  // npm module
    target: { ... },
  },
  {
    path: 'vaults/notes',
    theme: './themes/custom',  // local directory
    target: { ... },
  },
  {
    path: 'vaults/anuppuccin',
    theme: 'svartz-theme-anuppuccin',  // community theme (published on npm)
    target: { ... },
  },
  {
    path: 'vaults/custom',
    theme: '/home/user/my-svartz-themes/special',  // absolute path
    target: { ... },
  },
]
```

## Resolution algorithm

```ts
// packages/cli/src/utils/resolve-theme.ts
import path from 'path';
import fs from 'fs';
import { importModuleFromProject } from './resolve-modules';

/**
 * Resolve a theme reference to an actual module path
 * 1. If starts with '/', treat as absolute path
 * 2. If starts with './' or '../', treat as relative to project root
 * 3. Otherwise, treat as npm module name
 */
export async function resolveTheme(
  themeRef: string,
  projectRoot: string
): Promise<string> {
  // Absolute path
  if (path.isAbsolute(themeRef)) {
    if (!fs.existsSync(themeRef)) {
      throw new Error(`Theme path not found: ${themeRef}`);
    }
    return themeRef;
  }

  // Relative path
  if (themeRef.startsWith('./') || themeRef.startsWith('../')) {
    const resolved = path.resolve(projectRoot, themeRef);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Theme path not found: ${resolved}`);
    }
    return resolved;
  }

  // npm module (e.g., '@svartz/theme-minimal')
  try {
    const module = await importModuleFromProject(themeRef, projectRoot);
    // Module is loaded; return a marker indicating it's an npm module
    return themeRef;  // Keep the module name as the reference
  } catch (err) {
    throw new Error(
      `Could not resolve theme '${themeRef}'. ` +
      `Is it a local path or installed npm module?`
    );
  }
}

/**
 * Get theme exports using the resolved reference
 */
export async function getThemeExports(
  themeRef: string,
  projectRoot: string
): Promise<Set<string>> {
  // If it's an npm module, import directly
  if (!path.isAbsolute(themeRef) && 
      !themeRef.startsWith('./') && 
      !themeRef.startsWith('../')) {
    return await getModuleExports(themeRef, projectRoot);
  }

  // If it's a local path, import from the resolved path
  const resolved = path.resolve(projectRoot, themeRef);
  const module = await import(resolved);
  return new Set(
    Object.keys(module).filter(key => key !== 'default' && !key.startsWith('_'))
  );
}
```

## CLI commands for theme management

### Install a theme from npm

```bash
pnpm svartz theme:add @svartz/theme-minimal
```

This:
1. Adds `@svartz/theme-minimal` to `apps/web/package.json` dependencies
2. Runs `pnpm install`
3. Optionally updates `svartz.config.ts` if user specifies a vault

### Remove a theme

```bash
pnpm svartz theme:remove @svartz/theme-minimal
```

This:
1. Removes from `apps/web/package.json`
2. Runs `pnpm install`
3. Warns if any vault still references it in `svartz.config.ts`

### List installed themes

```bash
pnpm svartz theme:list
```

Output:
```
Installed themes:
  • @svartz/theme-default (npm)
  • @svartz/theme-minimal (npm)
  • ./themes/custom (local)
```

### Implementation (theme:add)

```ts
// packages/cli/src/commands/theme-add.ts
import { addDependency } from './package-json-utils';

export async function addTheme(themeName: string) {
  const projectRoot = findProjectRoot();
  
  // Resolve to ensure it exists (npm module or path)
  try {
    await resolveTheme(themeName, projectRoot);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // If it's an npm module, add to apps/web
  if (!path.isAbsolute(themeName) && 
      !themeName.startsWith('./') && 
      !themeName.startsWith('../')) {
    const webPackageJsonPath = path.join(projectRoot, 'apps/web/package.json');
    await addDependency(webPackageJsonPath, themeName, 'latest');
    
    console.log(`✅ Added ${themeName} to apps/web dependencies`);
    console.log(`\nRun 'pnpm install' to fetch the theme.`);
  }
}
```

## Package structure for npm themes

Theme packages follow a standard export structure:

```ts
// @svartz/theme-minimal/index.ts
export { SidebarLayout } from './layouts/Sidebar.svelte';
export { Card } from './components/Card.svelte';
export { Badge } from './components/Badge.svelte';
// ... all exported components
```

Published to npm with:
```jsonc
{
  "name": "@svartz/theme-minimal",
  "version": "1.0.0",
  "description": "Minimal Svartz theme",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  }
}
```

## CLI init flow

```bash
$ pnpm create svartz
? Project name: my-docs
? Use default theme (@svartz/theme-default)? Y

✅ Scaffolding...
✅ Installing dependencies...
```

If user says yes:
- `apps/web/package.json` gets `@svartz/theme-default` as a dependency
- `svartz.config.ts` sample vault references `@svartz/theme-default`
- `pnpm install` is run

If user says no:
- Minimal scaffold with no default theme
- User adds themes later with `pnpm svartz theme:add`

## Benefits

- **Small CLI bundle** — No themes bundled; just the orchestrator
- **Modular themes** — Each theme is versioned independently, published separately
- **User control** — Pick and choose themes, or use custom local themes
- **Flexibility** — Local + npm modules can coexist
- **Easy discovery** — Themes are discoverable as npm packages

## Relationship to @svartz/config

Theme resolution is **consumer-owned**, not part of `@svartz/config`. The config package validates theme references syntactically (via Effect Schema decode of `VaultThemeConfig`) and normalizes `theme: "string"` to `{ base: string, config: {} }` during path resolution. Actual theme module loading, export inspection, and installation are handled by CLI commands and Vite plugin integration.

Future shared theme-resolution helpers may be added as optional utilities if multiple consumers need identical resolution logic. This is not yet part of the config contract.

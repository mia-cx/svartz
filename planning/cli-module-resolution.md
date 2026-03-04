# CLI: Module resolution relative to project root

## Problem

The Svartz CLI can be invoked in multiple ways:

- **Global install:** `svartz <command>` (CLI binary installed globally)
- **pnpm dlx:** `pnpm dlx svartz <command>` (CLI downloaded on-demand)
- **Monorepo script:** `pnpm svartz <command>` (CLI from workspace)
- **Relative invocation:** Direct call from project directory

Regardless of where the CLI binary is located, it needs to resolve **project-specific modules** (themes, components, plugins) from the user's project's `node_modules`, not from the CLI's installation directory.

## Solution: Anchor on `svartz.config.ts`

The project root is determined by walking up from `cwd` until we find `svartz.config.ts`. All module resolution happens relative to that project root.

### Implementation

```ts
// packages/cli/src/utils/resolve-modules.ts
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the Svartz project root by walking up from startDir
 * until we find svartz.config.ts
 */
export function findProjectRoot(startDir = process.cwd()): string {
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    const configPath = path.join(current, 'svartz.config.ts');
    if (fs.existsSync(configPath)) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new Error(
    `Could not find svartz.config.ts in ${startDir} or any parent directory. ` +
    `Are you in a Svartz project?`
  );
}

/**
 * Dynamically import a module (e.g., '@svartz/themes-default') relative to the project root.
 * This ensures the CLI resolves the project's node_modules, not the CLI's own.
 */
export async function importModuleFromProject(
  moduleName: string,
  projectRoot: string
): Promise<any> {
  const nodeModulesPath = path.resolve(projectRoot, 'node_modules');

  // Use require.resolve to find the module in the project's node_modules
  const require = createRequire(import.meta.url);
  
  let resolvedPath: string;
  try {
    resolvedPath = require.resolve(moduleName, {
      paths: [nodeModulesPath],
    });
  } catch (err) {
    throw new Error(
      `Failed to resolve module '${moduleName}' in project ${projectRoot}. ` +
      `Is it installed in this project's dependencies?`
    );
  }

  // Dynamically import using the resolved path
  return await import(resolvedPath);
}

/**
 * Extract named exports from a theme or component module
 */
export async function getModuleExports(
  moduleName: string,
  projectRoot: string
): Promise<Set<string>> {
  try {
    const module = await importModuleFromProject(moduleName, projectRoot);
    return new Set(
      Object.keys(module).filter(key => key !== 'default' && !key.startsWith('_'))
    );
  } catch (err) {
    console.error(`Error loading exports from ${moduleName}:`, err);
    return new Set();
  }
}

/**
 * Resolve a path relative to the project root
 * (e.g., vaults/docs → /absolute/path/to/project/vaults/docs)
 */
export function resolveProjectPath(
  relativePath: string,
  projectRoot: string
): string {
  return path.resolve(projectRoot, relativePath);
}
```

### Usage examples

```ts
// In a CLI command handler
import { findProjectRoot, importModuleFromProject, getModuleExports } from './utils/resolve-modules';

async function handleThemeMigrate(options: { vault: string; from: string; to: string }) {
  // Find project root from cwd
  const projectRoot = findProjectRoot();
  
  // Get theme exports
  const fromExports = await getModuleExports(`@svartz/themes-${options.from}`, projectRoot);
  const toExports = await getModuleExports(`@svartz/themes-${options.to}`, projectRoot);
  
  // Resolve vault path
  const vaultPath = resolveProjectPath(`vaults/${options.vault}`, projectRoot);
  
  // ... rest of migration logic
}
```

### Scenarios

**Scenario 1: Global install, project directory**

```bash
cd /home/user/my-svartz-project
svartz theme:migrate --vault docs --from default --to minimal
```

- `findProjectRoot()` starts at `/home/user/my-svartz-project`
- Finds `svartz.config.ts` immediately
- Resolves modules from `/home/user/my-svartz-project/node_modules`
- ✅ Works

**Scenario 2: Global install, nested in project**

```bash
cd /home/user/my-svartz-project/vaults/docs
svartz theme:migrate --vault docs --from default --to minimal
```

- `findProjectRoot()` starts at `/home/user/my-svartz-project/vaults/docs`
- Walks up to `/home/user/my-svartz-project`, finds `svartz.config.ts`
- Resolves modules from `/home/user/my-svartz-project/node_modules`
- ✅ Works

**Scenario 3: pnpm dlx**

```bash
cd /tmp/some-project
pnpm dlx svartz init
```

- `findProjectRoot()` starts at `/tmp/some-project`
- May not find `svartz.config.ts` (fresh project), throws with helpful error
- ✅ Expected behavior (user hasn't initialized yet)

**Scenario 4: Monorepo, from workspace**

```bash
cd /home/user/monorepo
pnpm svartz build:all
```

- `findProjectRoot()` starts at `/home/user/monorepo`
- Finds `svartz.config.ts`
- Resolves modules from `/home/user/monorepo/node_modules`
- ✅ Works

### Error handling

```ts
try {
  const projectRoot = findProjectRoot();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
```

Output:
```
❌ Could not find svartz.config.ts in /tmp/random-dir or any parent directory.
   Are you in a Svartz project?
```

### Notes

- **`require.resolve` with `paths`:** Tells Node to look for modules only in the specified directory (the project's `node_modules`).
- **Dynamic import:** Uses `import()` to load the resolved module at runtime, avoiding static bundling.
- **Named exports:** Filters out `default` and private keys (`_*`) to get clean component lists.
- **Filtering:** Excludes default exports and private exports (by convention, names starting with `_`).

### Relationship to @svartz/config

Project root discovery (`findProjectRoot`) is currently CLI-owned. The `@svartz/config` package owns config loading, decoding (via Effect Schema), and path resolution but does not own root discovery. If multiple consumers need identical root-finding logic, it may be unified under config in a future iteration. Error handling in CLI should use `instanceof` checks on config's tagged errors (`ConfigNotFound`, `ConfigImportFailed`, etc.).

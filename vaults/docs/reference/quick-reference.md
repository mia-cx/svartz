# Quick Reference

Fast lookup for common tasks and function signatures.

## Most Common Functions

### Plugin System

```typescript
import {
  definePlugin,
  normalizePlugin,
  mergePlugins,
  sortPluginsForStage,
} from "@svartz/core";
import {
  discoverFiles,
  filterUnpublished,
  transformGfm,
  indexContent,
  emitArtifacts,
} from "@svartz/plugins";

// Create a plugin
export const myPlugin = definePlugin(() => ({
  id: "my:plugin",
  discover: (ctx) => {
    /* ... */
  },
  transformContent: {
    run: (ctx) => {
      /* ... */
    },
    options: { enforce: "post", parallel: false },
  },
}));

// Validate plugin
const normalized = normalizePlugin(myPlugin);

// Sort plugins for a stage
const sorted = sortPluginsForStage(plugins, "transformContent");

// Merge plugins from multiple layers
const merged = mergePlugins([
  corePlugins,
  themePlugins,
  defaultPlugins,
  vaultPlugins,
]);
```

---

### Theme System

```typescript
import { defineTheme, type SvartzTheme } from "@svartz/core";

// Static theme
export default defineTheme({
  id: "@myorg/theme-custom",
  version: "1.0.0",
  contractVersion: "1.0.0",
  layouts: {
    defaultPage: { default: DefaultLayout },
    notePage: { default: NoteLayout },
  },
  routes: [{ id: "note", pattern: "/[...slug]", layoutSlot: "notePage" }],
});

// Factory theme (with options)
export default defineTheme((opts = {}) => ({
  id: "@myorg/theme-configurable",
  // ... fields ...
  contractVersion: "1.0.0",
}));
```

---

### Config System

```typescript
import {
  loadConfig,
  resolveConfig,
  loadAndResolveConfig,
} from "@svartz/config";

// Load config
const config = await loadConfig("./svartz.config.ts");

// Resolve (apply defaults, resolve paths)
const resolved = await resolveConfig(config);

// One-step
const config = await loadAndResolveConfig("./svartz.config.ts");

// Access resolved data
config.vaults.forEach((vault) => {
  console.log(vault.path); // Absolute path
});
```

---

## Common Patterns

### Custom Plugin (Shorthand)

```typescript
import { definePlugin } from "@svartz/core";

export const customHighlight = definePlugin(() => ({
  id: "custom:highlight",
  transformContent: (ctx) => {
    ctx.files.forEach((file) => {
      file.content = addHighlighting(file.content);
    });
  },
}));
```

---

### Custom Plugin (Full Form with Options)

```typescript
import { definePlugin } from "@svartz/core";

export const customHighlight = definePlugin(() => ({
  id: "custom:highlight",
  transformContent: {
    run: (ctx) => {
      ctx.files.forEach((file) => {
        file.content = addHighlighting(file.content);
      });
    },
    options: {
      fatal: false,
      enforce: "post", // Run after default transformers
      parallel: false, // Run sequentially
    },
  },
}));
```

---

### Custom Theme

```typescript
import { defineTheme } from "@svartz/core";
import DefaultLayout from "./layouts/Default.svelte";
import NoteLayout from "./layouts/Note.svelte";

export default defineTheme({
  id: "@myorg/theme-modern",
  version: "1.0.0",
  contractVersion: "1.0.0",
  displayName: "Modern Theme",
  layouts: {
    defaultPage: { default: DefaultLayout },
    notePage: { default: NoteLayout },
    notFoundPage: { default: NotFoundLayout },
  },
  routes: [
    { id: "note", pattern: "/[...slug]" },
    { id: "tag", pattern: "/tags/[tag]" },
  ],
  artifactRequirements: {
    index: true,
    graph: false,
    backlinks: false,
  },
  renderCapabilities: {
    wikilinks: true,
    codeBlocks: true,
    syntaxHighlighting: true,
    math: true,
  },
});
```

---

### Config File

```typescript
// svartz.config.ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",

  defaults: {
    vault: {
      include: ["**/*.md"],
      exclude: ["node_modules/**", ".git/**"],
      frontmatterFields: {
        titleField: "title",
        publishedField: "published",
      },
    },
    theme: "@svartz/theme-minimal",
    plugins: [],
  },

  vaults: {
    docs: {
      path: "./docs",
    },
    wiki: {
      path: "./wiki",
      theme: {
        base: "@svartz/theme-minimal",
        tailwind: {
          extend: {
            /* ... */
          },
        },
      },
    },
  },
});
```

---

## Error Handling

### Plugin Validation

```typescript
import { normalizePlugin } from "@svartz/core";
import { PluginValidationError } from "@svartz/core";

try {
  const normalized = normalizePlugin(rawPlugin);
} catch (err) {
  if (err instanceof PluginValidationError) {
    console.error(`Plugin ${err.pluginId}: ${err.message}`);
  }
}
```

---

### Theme Validation

```typescript
import { defineTheme } from "@svartz/core";
import { ThemeValidationError } from "@svartz/core";

try {
  const theme = defineTheme({
    id: "my:theme",
    // ... fields ...
  });
} catch (err) {
  if (err instanceof ThemeValidationError) {
    console.error(`Theme ${err.themeId}: ${err.message}`);
  }
}
```

---

### Config Errors

```typescript
import { loadConfig } from "@svartz/config";
import {
  ConfigLoadError,
  ConfigValidationError,
  ConfigResolutionError,
} from "@svartz/config";

try {
  const config = await loadConfig("./svartz.config.ts");
} catch (err) {
  if (err instanceof ConfigLoadError) {
    console.error(`Failed to load config: ${err.message}`);
  } else if (err instanceof ConfigValidationError) {
    err.details.forEach((d) => console.error(`  ${d.field}: ${d.message}`));
  } else if (err instanceof ConfigResolutionError) {
    console.error(`Resolution failed: ${err.message}`);
  }
}
```

---

## JSDoc / TypeScript Tips

### Plugin JSDoc Template

````typescript
/**
 * Description of what the plugin does.
 *
 * @description
 * Detailed explanation of behavior, transformations, side effects.
 *
 * @example
 * ```ts
 * const plugin = myPlugin();
 * runner.execute([plugin], config);
 * ```
 *
 * @returns SvartzPlugin ready for the pipeline
 * @throws PluginValidationError if validation fails
 * @see {@link related-doc} for more context
 */
export function myPlugin(): SvartzPlugin {
  return definePlugin(() => ({
    // ...
  }));
}
````

---

### Theme JSDoc Template

````typescript
/**
 * Description of the theme.
 *
 * @description
 * Visual style, target audience, key features.
 *
 * @example
 * ```ts
 * import theme from "@myorg/theme-modern";
 * export default theme;
 * ```
 *
 * @returns Callable factory that returns SvartzTheme
 * @throws ThemeValidationError on validation failure
 * @see {@link theme-contract} for full theme contract
 */
export default defineTheme({
  // ...
});
````

---

## Stage Diagram

```
discover
    │ (files discovered, frontmatter parsed, slugs generated)
    ▼
filterUnpublished
    │ (draft files removed)
    ▼
transformContent (parallel if enforce: "default")
    ├─ transformGfm
    ├─ transformSyntax
    ├─ transformLatex
    └─ transformOfm
    │ (markdown content transformed)
    ▼
indexContent
    ├─ transformDescription (extract summary)
    └─ indexContent (build index)
    │ (search index and metadata ready)
    ▼
resolveLinks
    │ (wikilinks resolved — currently stub)
    ▼
emit
    │ (artifacts written to disk)
    ▼
(Done)
```

---

## Type Aliases for Quick Reference

```typescript
// Core types
type SvartzPlugin = { id: string; disabled?: boolean /* hooks */ };
type SvartzTheme = {
  id: string;
  version: string;
  contractVersion: string;
  layouts;
  routes;
};
type PluginContext = {
  stage: string;
  files: ProcessedFile[];
  config: ResolvedSvartzConfig;
};
type ProcessedFile = {
  path: string;
  slug: string;
  content: string;
  frontmatter: Record<string, any>;
};
type HookInput = (ctx: PluginContext) => void | Promise<void> | HookObject;
type ThemeComponentLoader = () => Promise<{ default: any }> | { default: any };

// Errors
type PluginValidationError = {
  _tag: "PluginValidationError";
  pluginId: string;
};
type ThemeValidationError = { _tag: "ThemeValidationError"; themeId: string };
type ConfigLoadError = { _tag: "ConfigLoadError"; filePath: string };
type ConfigValidationError = {
  _tag: "ConfigValidationError";
  details: ValidationErrorDetail[];
};
```

---

## See Also

- [[contracts/plugin-contract]] — Full plugin system spec
- [[contracts/theme-contract]] — Full theme system spec
- [[contracts/config-contract]] — Full config spec
- [[plugins/overview]] — All core plugins
- [[plugins/utilities]] — Utility functions

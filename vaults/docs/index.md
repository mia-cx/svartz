# Svartz Documentation Vault

Complete reference and guides for the Svartz documentation, theme, and plugin systems.

## Quick Navigation

### 📖 Start Here

- **[[guides/setup-config]]** — Set up Svartz from scratch (new users)
- **[[guides/create-plugin]]** — Write a custom plugin
- **[[guides/create-theme]]** — Author a custom theme
- **[[guides/runtime-vite-integration]]** — Understand runtime Vite + SvelteKit integration
- **[[reference/quick-reference]]** — Code snippets and patterns

### 📚 Contracts (Source of Truth)

Deep dives into each component:

- **[[contracts/plugin-contract]]** — Plugin system (types, validation, utilities)
- **[[contracts/theme-contract]]** — Theme system (defineTheme, validation)
- **[[contracts/config-contract]]** — Configuration (schema, API, errors)

### 🔧 Plugins

Reference for all core plugins:

- **[[plugins/overview]]** — Quick lookup table, stage breakdown
- **[[plugins/discover-files]]** — Vault discovery and slug generation
- **`plugins/utilities`** — Internal utilities (slug, ignore, parse, resolve)

### 📖 Reference

Detailed documentation:

- **[[reference/IMPLEMENTATION-SUMMARY]]** — Coverage checklist, JSDoc alignment
- **[[reference/quick-reference]]** — Common patterns, error handling, code examples

---

## Directory Structure

```
vaults/docs/
├── README.md                    ← You are here
├── contracts/
│   ├── plugin-contract.md       # Plugin system spec
│   ├── theme-contract.md        # Theme system spec
│   └── config-contract.md       # Config schema & API
├── plugins/
│   ├── overview.md              # All plugins at a glance
│   ├── discover-files.md        # Deep dive: discover stage
│   └── utilities/               # Plugin utilities (one file per utility)
│       ├── README.md
│       ├── normalize-plugin.md
│       ├── sort-plugins-for-stage.md
│       ├── merge-plugins.md
│       ├── slug.md
│       ├── ignore.md
│       ├── datetime.md
│       ├── parse.md
│       └── resolve.md
├── guides/
│   ├── setup-config.md          # Setup guide (0→production)
│   ├── create-plugin.md         # Plugin authoring guide
│   └── create-theme.md          # Theme authoring guide
└── reference/
    ├── quick-reference.md       # Snippets & patterns
    └── IMPLEMENTATION-SUMMARY.md # Coverage & JSDoc status
```

---

## Key Concepts

### Stages

Plugins hook into 6 sequential stages:

1. **discover** — Traverse vault, parse frontmatter, generate slugs
2. **filterUnpublished** — Remove drafts
3. **transformContent** — Modify markdown (runs in parallel by default)
4. **indexContent** — Build search index and metadata
5. **resolveLinks** — Resolve wikilinks to slugs (stub)
6. **emit** — Write artifacts to disk

See [[plugins/overview#Stages Breakdown]] for details.

### Plugin Merge Order

Plugins from 4 layers merge with conflict resolution (by-id replacement):

1. Core plugins (`@svartz/plugins`)
2. Theme plugin preset
3. Config defaults plugins
4. Config vault plugins (most specific)

See [[contracts/plugin-contract#Utility Functions]] for merge logic.

### Contract Versioning

Both plugins and themes declare `contractVersion` (semver):
- Major version must match core's `CONTRACT_VERSION` (currently `1.0.0`)
- Validation error on mismatch
- Ensures compatibility across updates

See [[contracts/plugin-contract#Contract Versioning]] for details.

---

## Workflows

### 🎯 I Want To...

**Set up Svartz from scratch** → [[guides/setup-config]]

**Write a custom plugin** → [[guides/create-plugin]]

**Author a theme** → [[guides/create-theme]]

**Understand the Vite runtime bridge** → [[guides/runtime-vite-integration]]

**Understand the plugin system** → [[contracts/plugin-contract]]

**Look up a core plugin** → [[plugins/overview]]

**Find code examples** → [[reference/quick-reference]]

**Debug configuration issues** → [[contracts/config-contract#Troubleshooting]]

---

## Core Packages

### `@svartz/core`

- Plugin contract (`SvartzPlugin`, `PluginContext`)
- Theme contract (`SvartzTheme`, `defineTheme`)
- Effect Schema validation
- Shared schemas (Tailwind, Wrangler)
- Utilities (`normalizePlugin`, `mergePlugins`, `sortPluginsForStage`)

See [[contracts/plugin-contract]], [[contracts/theme-contract]]

### `@svartz/plugins`

- 10 core plugins across all stages
- Internal utilities (slug, ignore, parse, resolve)
- All plugins use `definePlugin()` factory

See [[plugins/overview]], `plugins/utilities`

### `@svartz/config`

- Configuration schema and validation
- Public API (`loadConfig`, `resolveConfig`, `loadAndResolveConfig`)
- Error handling (`ConfigLoadError`, `ConfigValidationError`, `ConfigResolutionError`)

See [[contracts/config-contract]]

---

## JSDoc Alignment

**Status:** ✅ All public functions include comprehensive JSDoc

### Coverage

- ✅ `@svartz/core` — Plugin/theme contracts, utilities
- ✅ `@svartz/plugins` — All core plugins and utilities
- ✅ `@svartz/config` — Public API and errors

See [[reference/IMPLEMENTATION-SUMMARY#JSDoc Alignment]] for full details.

---

## Best Practices

### Plugin Authoring

- Use descriptive IDs (e.g., `"myorg:transform-callouts"`)
- Document with JSDoc
- Handle errors gracefully
- Test in isolation before integrating
- Mutate files in-place for efficiency

See [[guides/create-plugin#Best Practices]]

### Theme Authoring

- Use semantic versioning
- Include both `defaultPage` and `notePage`
- Support responsive design
- Provide light/dark mode
- Test with real vault content

See [[guides/create-theme#Best Practices]]

### Configuration

- Use consistent frontmatter field names
- Remember: missing `publishedField` = draft
- Override per-vault when needed
- Validate your config

See [[guides/setup-config#Troubleshooting]]

---

## Examples

### Minimal Config

```typescript
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  defaults: { theme: "@svartz/theme-minimal" },
  vaults: {
    docs: { path: "./vaults/docs" }
  }
});
```

### Custom Plugin

```typescript
import { definePlugin } from "@svartz/core";

export const myPlugin = definePlugin(() => ({
  id: "custom:my-plugin",
  transformContent: (ctx) => {
    ctx.files.forEach(file => {
      file.content = /* transform */;
    });
  }
}));
```

### Custom Theme

```typescript
import { defineTheme } from "@svartz/core";

export default defineTheme({
  id: "@myorg/theme-custom",
  version: "1.0.0",
  contractVersion: "1.0.0",
  layouts: { defaultPage: { default: Default }, notePage: { default: Note } },
  routes: [{ id: "note", pattern: "/[...slug]" }]
});
```

See [[reference/quick-reference]] for more examples.

---

## Contributing

When updating Svartz contracts or implementations:

1. Update relevant source code (JSDoc required)
2. Update corresponding doc file here
3. Keep wikilinks and cross-references current
4. Validate with examples

---

## See Also

- `planning/contracts/` — Technical design decisions
- `.cursor/rules/plugin-conventions.mdc` — Agent guidelines
- Source code in `packages/core`, `packages/plugins`, `packages/config`

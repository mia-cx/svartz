# Svartz Documentation Vault

Complete reference documentation for the Svartz project, including architecture, contracts, and implementation details for:

- **@svartz/core** — Plugin and theme contracts, Effect Schema validation, shared schemas
- **@svartz/plugins** — Core pipeline plugin implementations
- **@svartz/config** — Configuration loading and validation

## Quick Navigation

### Contracts & Architecture
- [[plugin-contract]] — Plugin system contract and API
- [[theme-contract]] — Theme contract and `defineTheme` factory
- [[config-contract]] — Configuration schema and resolution

### Core (@svartz/core)

**Plugin System**
- [[plugin-types]] — `SvartzPlugin`, `PluginContext`, hook interfaces
- [[plugin-validation]] — Effect Schema validation and `normalizePlugin`
- [[plugin-utilities]] — `sortPluginsForStage`, `mergePlugins`, error handling

**Theme System**
- [[theme-types]] — `SvartzTheme`, layouts, routes, component loaders
- [[theme-define]] — `defineTheme` factory with validation
- [[theme-validation]] — Contract validation rules and errors

**Shared Schemas**
- [[tailwind-schema]] — Tailwind configuration schema and types
- [[wrangler-schema]] — Wrangler configuration schema and types

### Plugins (@svartz/plugins)

Core pipeline plugins (each with implementation details):
- [[plugin-discover-files]] — Traverse vault, parse frontmatter
- [[plugin-filter-unpublished]] — Remove drafts/unpublished files
- [[plugin-transform-ofm]] — Parse frontmatter YAML
- [[plugin-transform-description]] — Extract first 1-3 sentences
- [[plugin-transform-gfm]] — GitHub Flavored Markdown processing
- [[plugin-transform-syntax]] — Syntax highlighting preparation
- [[plugin-transform-latex]] — LaTeX/math block handling
- [[plugin-index-content]] — Build search index and manifest
- [[plugin-emit-artifacts]] — Write final artifacts (index.json, graph, backlinks)

Utilities:
- [[plugin-internals-slug]] — Slug generation and conflict detection
- [[plugin-internals-ignore]] — `.gitignore` parsing
- [[plugin-internals-datetime]] — ISO timestamp utilities
- [[plugin-internals-parse]] — YAML/frontmatter parsing helpers

### Config (@svartz/config)

- [[config-schema]] — Effect Schema definitions (source of truth)
- [[config-loader]] — Loading and parsing `svartz.config.ts`
- [[config-resolver]] — Path resolution and defaults merging
- [[config-types]] — Tagged error types, configuration interfaces

## Key Concepts

### Stages
Plugins hook into 6 stages with `pre` / `default` / `post` enforcement:
1. **discover** — File discovery and frontmatter parsing
2. **filterUnpublished** — Remove drafts
3. **transformContent** — Content transformations (GFM, syntax, LaTeX)
4. **indexContent** — Build index and metadata
5. **resolveLinks** — Wikilink resolution
6. **emit** — Write final artifacts

### Plugin Merge Order
1. Core plugins
2. Theme plugin preset
3. Config defaults plugins
4. Config vault plugins

Duplicate IDs replace earlier entries; new IDs append.

### Contract Versioning
- Both plugins and themes use `contractVersion` (semver)
- Compatibility check: major version must match `CONTRACT_VERSION` from `@svartz/core`
- Validation errors on mismatch; warnings on unknown keys

## Usage Examples

See individual note sections for function-level signatures and usage examples.

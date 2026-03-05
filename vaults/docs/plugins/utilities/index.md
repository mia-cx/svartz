# Plugin Utilities & Internals

Reference for utility functions and internal modules used across `@svartz/plugins`.

## Public API (from `@svartz/core`)

- **[[plugins/utilities/normalize-plugin]]** — Validate and normalize plugin to standard form
- **[[plugins/utilities/sort-plugins-for-stage]]** — Sort plugins by enforce level for a stage
- **[[plugins/utilities/merge-plugins]]** — Merge plugins from 4 layers with conflict resolution

## Internal Utilities (from `@svartz/plugins/internal`)

- **[[plugins/utilities/slug]]** — Slug generation and conflict detection
- **[[plugins/utilities/ignore]]** — Gitignore and include/exclude pattern matching
- **[[plugins/utilities/datetime]]** — ISO timestamp parsing and formatting
- **[[plugins/utilities/parse]]** — YAML frontmatter extraction and parsing
- **[[plugins/utilities/resolve]]** — Wikilink parsing and resolution helpers

## See Also

- [[plugins/overview]] — All core plugins reference
- [[contracts/plugin-contract]] — Plugin system contract
- [[plugins/discover-files]] — Uses slug + ignore utilities

# @svartz/ui

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.
- c2b31c8: Notes and folders can set their place in the explorer and the wiki section bar with an `order` number in their frontmatter, lowest first. A folder takes its folder note's `order`; anything without one follows in title order.
- 6a78dcc: New `@svartz/theme-mcp-docs` documents MCP tools: input and output schemas, annotations, and `tools/call` examples that label tool errors and JSON-RPC errors apart. It and `@svartz/theme-api-docs` now share one reference shell from `@svartz/ui/reference`, so one site can combine REST, GraphQL, and MCP pages with `referenceTheme({ renderers: [...apiRenderers, ...mcpRenderers] })`. Each page's `operation.protocol` or `model` metadata picks its renderer, and metadata no renderer can read fails the build with the page's path. The sidebar gains a filter, nested folder groups, and fixed-width method badges beside each path. Operation pages show defaults, allowed values, limits, and "Defined in" source links.

### Patch Changes

- Updated dependencies [67b759b]
  - @svartz/plugins@1.1.0
  - @svartz/core@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [dd069ad]
- Updated dependencies [6dd3049]
  - @svartz/plugins@1.0.1
  - @svartz/core@1.0.1

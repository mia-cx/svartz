# @svartz/theme-mcp-docs

## 1.1.1

### Patch Changes

- 3079ddc: `@svartz/theme-mcp-docs` is now installable from npm. Its 1.1.0 publication stopped before upload, so 1.1.1 is its first release; every other package's 1.1.1 matches its 1.1.0.
- @svartz/core@1.1.1
  - @svartz/ui@1.1.1

## 1.1.0

### Minor Changes

- 6a78dcc: New `@svartz/theme-mcp-docs` documents MCP tools: input and output schemas, annotations, and `tools/call` examples that label tool errors and JSON-RPC errors apart. It and `@svartz/theme-api-docs` now share one reference shell from `@svartz/ui/reference`, so one site can combine REST, GraphQL, and MCP pages with `referenceTheme({ renderers: [...apiRenderers, ...mcpRenderers] })`. Each page's `operation.protocol` or `model` metadata picks its renderer, and metadata no renderer can read fails the build with the page's path. The sidebar gains a filter, nested folder groups, and fixed-width method badges beside each path. Operation pages show defaults, allowed values, limits, and "Defined in" source links.

### Patch Changes

- Updated dependencies [67b759b]
- Updated dependencies [c2b31c8]
- Updated dependencies [6a78dcc]
  - @svartz/core@1.1.0
  - @svartz/ui@1.1.0

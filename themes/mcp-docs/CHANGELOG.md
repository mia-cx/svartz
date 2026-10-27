# @svartz/theme-mcp-docs

## 1.2.1

### Patch Changes

- Updated dependencies [ce77637]
  - @svartz/ui@1.2.1
  - @svartz/core@1.2.1

## 1.2.0

### Minor Changes

- 1debbc9: Schema trees list every `oneOf`/`anyOf` alternative with its own fields and required marks, named by its `title` or discriminator value (`kind: webhook`), including inside arrays and nested objects. A `null` type or alternative makes a field nullable: `anyOf: [{ type: string, format: uri }, { type: 'null' }]` reads `string (uri) | null`, and `type: [string, number, null]` keeps both types.

  REST request examples no longer assume JSON. They read each success response for what it holds: nothing for a 204 or a response with `empty: true`, text for `contentType: text/markdown`, bytes for `image/png`, JSON otherwise, branching on the status when successes differ. A request body with `contentType: application/x-www-form-urlencoded` or `multipart/form-data` encodes as a form. Only `bearer`, `oauth2`, `openIdConnect`, and `basic` generate an `Authorization` header; other schemes send none. `operation.server` overrides the theme's `baseUrl` for one operation, and `order` frontmatter sorts reference sidebar sections, groups, and pages.

### Patch Changes

- Updated dependencies [1debbc9]
  - @svartz/ui@1.2.0
  - @svartz/core@1.2.0

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

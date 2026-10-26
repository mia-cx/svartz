---
"@svartz/ui": minor
"@svartz/theme-api-docs": minor
"@svartz/theme-mcp-docs": minor
---

New `@svartz/theme-mcp-docs` documents MCP tools: input and output schemas, annotations, and `tools/call` examples that label tool errors and JSON-RPC errors apart. It and `@svartz/theme-api-docs` now share one reference shell from `@svartz/ui/reference`, so one site can combine REST, GraphQL, and MCP pages with `referenceTheme({ renderers: [...apiRenderers, ...mcpRenderers] })`. Each page's `operation.protocol` or `model` metadata picks its renderer, and metadata no renderer can read fails the build with the page's path. The sidebar gains a filter, nested folder groups, and fixed-width method badges beside each path. Operation pages show defaults, allowed values, limits, and "Defined in" source links.

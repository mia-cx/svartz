# @svartz/theme-mcp-docs

Reference docs for an MCP server: guides, then one note per tool. A tool page shows its name, the server it's called on, auth, input and output schemas, and annotations. Beside it, examples show each `tools/call` request and its response. Tool errors (`isError`) and JSON-RPC errors are labelled apart.

```ts
// svartz.config.ts
vaults: [{
  id: 'mcp',
  path: 'mcp',
  target: { type: 'static' },
  theme: {
    base: '@svartz/theme-mcp-docs',
    baseUrl: 'https://relay.example',   // joined to tool endpoints written as paths
    routes: { folders: 'reference' },
  },
}],
```

A tool note:

```yaml
operation:
  protocol: mcp
  kind: tool
  name: find_pets
  endpoint: /mcp
  auth: { scheme: bearer, description: A token with `pets:read`. }
  inputSchema: { type: object, properties: { species: { type: string, enum: [dog, cat] } } }
  annotations: { readOnlyHint: true }
  examples:
    - title: Dogs
      arguments: { species: dog }
      result: { structuredContent: { pets: [] } }
```

`model` notes are shared schemas that tools name with `$ref`. Other notes are guides. To document HTTP endpoints and MCP tools in one site, compose this theme's `extensions` with `@svartz/theme-api-docs`'s. The theme extends `@svartz/theme-minimal`, so its explorer, contents, and previous and next links are minimal's.

[Reference themes](../../docs/reference-themes.md) documents the full metadata format, the composition API, and upgrade steps. The types are exported as `McpTool`, `McpToolExample`, and `McpToolResult`.

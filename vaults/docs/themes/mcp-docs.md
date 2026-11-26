---
title: "MCP docs"
description: "Document MCP tools, input and output schemas, and tools/call examples."
---

Try the [combined Harbour reference demo](https://reference.demo.svartz.dev). Install `@svartz/theme-mcp-docs` and configure `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "mcp",
      path: "vault",
      target: { type: "static" },
      theme: {
        base: "@svartz/theme-mcp-docs",
        baseUrl: "https://relay.example.com",
        routes: { folders: "reference" },
      },
    },
  ],
});
```

Optional `baseUrl` is a string joined to endpoint paths such as `/mcp`. Use a full endpoint URL when the tool lives elsewhere. The theme also accepts `version`, `nav`, the shared reference route prefixes, and [[themes/api-docs#Versions|`versions`]], which publishes several versions from git with a picker. It retains [[themes/minimal|minimal's explorer, contents, and previous and next links]].

```yaml
operation:
  protocol: mcp
  kind: tool
  name: find_pets
  endpoint: /mcp
  auth: { scheme: bearer, description: A token with pets:read. }
  inputSchema: { type: object, properties: { species: { type: string } } }
  annotations: { readOnlyHint: true }
  examples:
    - title: Dogs
      arguments: { species: dog }
      result: { structuredContent: { pets: [] } }
```

A tool page shows the endpoint, auth, schemas, and annotations, with adjacent JSON-RPC examples. Tool errors and JSON-RPC errors have separate labels. Use `outputSchema` for the result shape. Put shared schemas in `model` notes and refer to them by `$ref`. Other notes stay guides.

The package exports the TypeScript types `McpTool`, `McpToolExample`, and `McpToolResult`. The theme documents a server; it does not implement one. See [[themes/choosing-and-composing|theme composition]] to include [[themes/api-docs|API docs]].

API reference: [[reference/api/theme-mcp-docs/McpDocsThemeConfig|McpDocsThemeConfig]] and the [[reference/api/theme-mcp-docs/index|@svartz/theme-mcp-docs]] types.

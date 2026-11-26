---
title: "API docs"
description: "Document REST, GraphQL, and WebSocket APIs from note metadata."
---

Try the [Harbour Shelter API demo](https://api.demo.svartz.dev). Install `@svartz/theme-api-docs` and configure `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "api",
      path: "vault",
      target: { type: "static" },
      theme: {
        base: "@svartz/theme-api-docs",
        baseUrl: "https://api.example.com/v2",
        graphqlEndpoint: "https://api.example.com/graphql",
        version: "v2",
        routes: { folders: "reference" },
      },
    },
  ],
});
```

`baseUrl` defaults to `https://api.example.com`. `graphqlEndpoint` defaults to `<baseUrl>/graphql`. Both are strings. Optional `version` and `nav` add a badge and header links. The theme builds on [[themes/minimal|minimal's explorer and list routes]].

```yaml
operation:
  protocol: rest
  method: GET
  path: /pets/{id}
  auth: bearer
  parameters: [{ name: id, in: path, type: string, example: pet_42 }]
  responses:
    200: { description: The pet., schema: { $ref: Pet } }
```

A REST operation shows parameters, request and response schemas, and examples in cURL, JavaScript, and Python. `server` overrides the theme's example base URL. `client: browser` shows browser form and HTTP examples instead. Use `protocol: websocket` with `messages` and `close` for a socket, or `protocol: graphql` with `kind`, `name`, `args`, and `returns` for GraphQL.

Give a model its own note with `model: { name: Pet, schema: { type: object } }`. A schema's `$ref` names that model. Guides have neither `operation` nor `model`. See the [metadata examples](https://github.com/mia-cx/svartz/blob/main/themes/api-docs/README.md#frontmatter) for the request, response, and schema fields. The theme renders documentation and examples; it does not serve the API.

[[themes/choosing-and-composing|Combine it]] with [[themes/mcp-docs|MCP docs]] in the same vault.

API reference: [[reference/api/theme-api-docs/ApiDocsThemeConfig|ApiDocsThemeConfig]].

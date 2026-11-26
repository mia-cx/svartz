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

## Versions

To document several API versions at once, as Shopify does with its dated versions, list them in `versions`. It replaces the `version` badge with a picker:

```ts
theme: {
  base: "@svartz/theme-api-docs",
  versions: [
    { id: "2026-04", status: "latest" },
    { id: "2026-01", ref: "api/2026-01" },
    { id: "2025-07", ref: "api/2025-07", status: "deprecated" },
  ],
},
```

The `latest` version is the vault as it stands, at the usual URLs. Every other version is the vault's folder at a git tag or branch, its `ref`, published below its `id`: `/2026-01/pets/get-pet/`. The latest version's id works too: `/2026-04/pets/get-pet/` redirects to `/pets/get-pet/` until 2026-04 is an older version, and then serves its own page, so a link to a version always means that version. Cut a version by tagging the commit whose docs describe it; the build reads each ref straight from git and never touches your checkout.

- The picker keeps the reader on the page they're reading, or opens that version's home page when it has no such page.
- A `deprecated` version's pages say so above the page, linking the same page in the latest version.
- Search covers the version being read. Only the latest version is in the sitemap and feed; older pages are reachable by URL and from the picker.
- Each older version builds once and is reused from `.svartz/vaults/<id>/versions/` until its ref moves or Svartz, the config, a file a plugin reads or the lockfile changes; with password groups, every version builds each time. Keep that folder between CI builds to keep the saving.

`status` defaults to `supported`, and exactly one version is `latest`. A CI checkout must hold the refs, such as with `fetch-depth: 0` or `git fetch --tags`. A note or file of the latest version can't publish below another version's id; the build fails naming it. To retire a version, remove it from `versions`.

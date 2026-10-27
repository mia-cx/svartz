# Reference themes: API and MCP docs in one site

`@svartz/theme-api-docs` and `@svartz/theme-mcp-docs` extend theme-minimal. Minimal's shell gives every page the explorer, search, breadcrumbs, contents, and previous and next links. Each theme adds page renderers: REST, WebSocket, GraphQL, and schema pages for API docs; MCP tool and schema pages for MCP docs. Both use the reference frame: a top bar, the explorer beside the page with method and TOOL badges and a filter, and code examples in a wide right column. Guides keep their contents on the right.

Use one theme when a site documents one kind of interface. Compose them when one site documents several, such as guides, HTTP endpoints, and MCP tools. [Composing themes](composing-themes.md) covers composition in general.

## Use one theme

```ts
// svartz.config.ts
theme: {
  base: '@svartz/theme-mcp-docs',
  baseUrl: 'https://relay.example',   // joined to tool endpoints written as paths
  routes: { folders: 'reference' },
  nav: { Status: 'https://status.example.com' },
}
```

Both themes read `tokens`, `routes`, `version`, `nav`, `footer.links`, and `comments`. The API theme also reads `baseUrl` and `graphqlEndpoint` for its request examples.

## Compose them

List both themes in `base`. Svartz composes them on theme-minimal's shell: the first listed theme styles the site, and each page renders with the theme that claims it. Every other `theme` key applies to all of them.

```ts
// svartz.config.ts
theme: {
  base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'],
  baseUrl: 'https://api.example.com',
  tokens: { accent: 'var(--brand)' },
}
```

Install `@svartz/theme-api-docs` and `@svartz/theme-mcp-docs`. Both themes include the shared schema renderer, and it counts once. The `showcase-reference` vault in this repository composes its themes this way and serves under `/docs`.

To reuse a combination across sites, publish it as one theme package. Export the combined `extensions` from both entries, so the package also composes inside another `base` list:

```js
// runtime.js; index.js is the same without `/runtime`
import { extensions as api } from '@svartz/theme-api-docs/runtime';
import { extensions as mcp } from '@svartz/theme-mcp-docs/runtime';
import { composeThemes } from '@svartz/theme-minimal/runtime';

export const extensions = [...api, ...mcp];
export default (config) => composeThemes(extensions, config, { id: '@acme/docs-theme' });
```

## How a page picks its renderer

A page names what it documents in its frontmatter:

| Metadata | Renderer |
| --- | --- |
| `operation.protocol: rest`, or `operation` without a protocol | REST endpoint |
| `operation.protocol: websocket` | WebSocket endpoint |
| `operation.protocol: graphql` | GraphQL operation |
| `operation.protocol: mcp` | MCP tool |
| `model` | Shared schema |
| neither | Guide: the page's Markdown, with its contents on the right |

The build fails with the page's path and the reason when:

- a page has both `operation` and `model`;
- its renderer can't read the metadata, such as a REST operation without a `path`.

Two themes claiming one page also fail, naming both; set `theme:` on the page to choose. A renderer two themes share, such as the schema renderer, counts once.

## Metadata every reference page can use

```yaml
source:                                  # "Defined in" links
  - https://github.com/acme/api/blob/main/src/routes/pets.ts#L48-L71    # shows src/routes/pets.ts:48–71
  - { label: OpenAPI document, href: https://api.example.com/openapi.json }
operation:
  auth: { scheme: bearer, description: A dashboard token., scopes: [pets:read] }   # or just: auth: bearer
```

Schemas are a JSON Schema subset. Fields show their type, whether they're required, `default`, `enum` or `const` values, length and range limits, `pattern`, and `description`. `additionalProperties` reads as a map, and `type: [string, "null"]` as nullable. A `$ref` names a `model` page, and `#/$defs/Pet` or `#/components/schemas/Pet` also resolve to `Pet`.

## MCP tools

```yaml
title: Find pets
description: Search adoptable pets by species and status.
operation:
  protocol: mcp
  kind: tool                       # resource and prompt pages are reserved for a later release
  name: find_pets
  title: Find pets                 # optional display name; also read from annotations.title
  endpoint: /mcp                   # the server's HTTP endpoint; a path joins the theme's baseUrl
  auth: { scheme: bearer, description: A token with `pets:read`. }
  inputSchema:
    type: object
    properties:
      species: { type: string, enum: [dog, cat] }
      limit: { type: integer, minimum: 1, maximum: 50, default: 10 }
  outputSchema:                    # optional: the shape of structuredContent
    type: object
    properties: { pets: { type: array, items: { $ref: Pet } } }
  annotations: { readOnlyHint: true, openWorldHint: false }
  examples:
    - title: Available dogs
      arguments: { species: dog }
      result: { structuredContent: { pets: [] } }
    - title: Limit too high
      arguments: { limit: 500 }
      result: { isError: true, content: [{ type: text, text: limit must be at most 50. }] }
    - title: Misspelled tool name
      arguments: {}
      error: { code: -32602, message: "Unknown tool: find_pet" }
```

Each example shows the JSON-RPC `tools/call` request and the response. A `result` is a tool result, and `isError: true` marks a tool that ran and failed. An `error` is a JSON-RPC error: the server rejected the request and no tool ran. Results pass `content` blocks through as written, including images, audio, and resource links. A result with only `structuredContent` also gets it as a JSON text block, as the MCP spec asks servers to send. A tool without examples gets one request built from its input schema.

Annotations show as the hints the server declares. They are not security guarantees.

## Markdown copies

Each page's `.md` copy and `llms.txt` entry carry its frontmatter, so agents read the same operation, tool, and schema metadata as people.

## Write a renderer

A renderer reads one kind of metadata and renders it. Its components can use `EndpointBar`, `AuthSummary`, `ReferenceSection`, `SchemaTree`, and `CodePanel` from `@svartz/ui/reference/runtime`. `referenceExtension` turns renderers into a theme-minimal extension with the reference frame, ready for `composeThemes`:

```ts
import { defineRenderer, referenceExtension } from '@svartz/ui/reference/runtime';

export const webhookRenderer = defineRenderer({
  id: 'webhook',                                     // operation.protocol: webhook
  read: (properties) => readWebhook(properties.operation), // return undefined, or throw with a reason, for bad metadata
  nav: (hook) => ({ badge: { label: 'HOOK', hue: 'orange' }, label: hook.event, sort: [1, hook.event, 0] }),
  page: WebhookPage,         // receives { data, context, children }; render children after the header
  examples: WebhookExamples, // optional; receives { data, context }
});

export const extensions = [referenceExtension({ id: '@acme/webhook-docs', name: 'webhooks' }, [webhookRenderer])];
```

Import components from `@svartz/ui/reference/runtime`. The bare `@svartz/ui/reference` entry has the Node-safe metadata readers and types only.

## Upgrading

**From 1.x to 2.0:** the API and MCP themes extend theme-minimal, and `referenceTheme`, `ReferenceLayout`, `ReferenceNav`, the reference nav model, and the renderer registry are gone from `@svartz/ui/reference`. A site that uses one theme only bumps versions. A site that combined renderers with `referenceTheme` deletes its `theme/` folder and lists both themes in `theme.base`, as under [Compose them](#compose-them). The sidebar becomes minimal's explorer: folders nest at any depth under their own names, and a folder's name opens its page. Its open folders persist across visits.

**From `@svartz/theme-api-docs` 1.0:** pages and config keep working. The sidebar now labels endpoints by path beside a method badge, gains a filter, and groups nested folders. Parameters accept `default`, `enum`, or a `schema`. `operation.auth` also accepts `{ scheme, description, scopes }`, so `RestOperation.auth` is now an object rather than a string. A page whose `operation` or `model` metadata can't be read now fails the build instead of rendering as a guide.

**From the minimal theme:** give each endpoint page `operation` metadata with `method` and `path`, and each tool page `operation` metadata with `protocol: mcp`, a `name`, and an `inputSchema`. Move "Sources:" lines into `source`. Then point `theme.base` at a theme, or list both. Pages without that metadata keep rendering as guides.

# @svartz/theme-api-docs

Reference docs for a REST or GraphQL API: guides, then one note per operation and per model. Operation pages put the reference on the left and copyable request and response examples on the right. The structure follows Stripe, Scalar, and Redoc; the look is Svartz's.

```ts
// svartz.config.ts
vaults: [{
  id: "api",
  path: "api",
  target: { type: "static" },
  theme: {
    base: "@svartz/theme-api-docs",
    version: "v2",
    baseUrl: "https://api.example.com/v2",       // request examples
    graphqlEndpoint: "https://api.example.com/graphql", // default: {baseUrl}/graphql
    routes: { folders: "reference" },
    nav: { Status: "https://status.example.com" },
  },
}],
```

## What it renders

| Page | Contents |
| --- | --- |
| REST operation | Method and path (copyable), auth, the note's own Markdown, parameters by location with defaults and allowed values, request body schema, responses by status with their schemas and headers, and "Defined in" source links. Examples: the request in cURL, JavaScript, and Python (the choice is remembered), and a response per status. A browser route shows its request as an HTML form and raw HTTP instead |
| WebSocket | `WS` and the path, auth, the note's Markdown, the upgrade's parameters, handshake responses, messages by direction with their schemas, and close codes. Examples: connecting in websocat, JavaScript, and Python, each message, and the handshake responses |
| GraphQL operation | Kind, name, arguments, return type, the note's Markdown. Examples: the endpoint, query, variables, and response |
| Model | "The X object": the note's Markdown, an attribute tree, and a generated JSON example |
| Guide | Any other note: its description, prose, and contents on the right |
| Lists | theme-minimal's tag, folder, and feed pages |

The theme extends `@svartz/theme-minimal`, so the sidebar is minimal's explorer: folders nest at any depth under their own names, a folder's name opens its page, and open folders persist across visits. A folder note (`graphql/index.md`) names its folder, so `GraphQL` doesn't read as `Graphql`. An `order` number in a page's frontmatter, or a folder note's for its folder, sorts it first, lowest first. Operations list by path beside a fixed-width method badge, and the filter above the explorer narrows it as you type; Enter opens the first match. Every page ends with previous and next links in explorer order.

To document HTTP endpoints and MCP tools in one site, compose this theme's `extensions` with `@svartz/theme-mcp-docs`'s. [Reference themes](../../docs/reference-themes.md#compose-them) shows how.

## Frontmatter

A REST operation:

```yaml
operation:
  protocol: rest
  method: POST
  path: /pets/{petId}/photos
  server: https://uploads.example.com   # optional; the theme's baseUrl otherwise
  auth: bearer                 # bearer, oauth2, openIdConnect, basic, none, or any label
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
    - { name: Idempotency-Key, in: header, type: string, description: … }
  requestBody:
    contentType: multipart/form-data   # default application/json
    schema: { $ref: NewPhoto }
    example: { caption: On the beach }   # optional; generated from the schema otherwise
  responses:
    201: { description: Created, schema: { $ref: Photo } }
    202: { description: Queued for review, empty: true }
    404: { description: No pet with this id., schema: { $ref: Error } }
```

Request examples encode the body for its `contentType`: JSON for `application/json` and `+json` types, form fields for `application/x-www-form-urlencoded` and `multipart/form-data`, and the example as written for anything else. They read each success response for what it holds. A 204, 205, or 304, or a response with `empty: true`, has no body. A `contentType` of `text/*` or XML reads as text, and any other non-JSON type as bytes. Without a `contentType`, a `schema` or `example` means JSON, and a response with neither reads as text. When successes differ, the example branches on the status. An operation whose only documented results are redirects reads `Location` without following it.

`bearer`, `oauth2`, and `openIdConnect` send `Authorization: Bearer $TOKEN`, and `basic` sends `Authorization: Basic $CREDENTIALS`. Any other scheme sends no credential: document its header as a `header` parameter.

A response's `headers` map names to example values. A response with headers shows as HTTP in the examples, its status line and headers above any body, so a redirect shows where it goes:

```yaml
  responses:
    303: { description: Back to the client., headers: { Location: https://client.example/callback?code=c_1 } }
```

A page or form action that a browser sends with its session takes `client: browser`. Its request shows as an HTML form, for a POST with a form body or none, and as the raw HTTP request, with `cookie` parameters as its `Cookie` header. Both use the path alone. A path with a query, such as the SvelteKit form action `/oauth/authorize?/allow`, joins query parameters with `&`.

```yaml
operation:
  method: POST
  path: /oauth/authorize?/allow
  client: browser
  parameters: [{ name: session, in: cookie, example: <browser-session> }]
  requestBody: { contentType: application/x-www-form-urlencoded, example: { client_id: lgc_1 } }
  responses:
    303: { description: Back to the client., headers: { Location: https://client.example/callback?code=c_1 } }
    403: { description: The owner lacks `logan`., contentType: text/html }
```

A WebSocket takes the same `path`, `server`, `auth`, `parameters`, and `responses` for its upgrade request, plus its messages and close codes:

```yaml
operation:
  protocol: websocket
  path: /v1/stream
  auth: bearer
  parameters: [{ name: v, in: query, required: true, example: 10 }]
  responses:
    101: { description: Switching Protocols }
    401: { description: A missing or invalid token., schema: { $ref: Problem } }
  messages:
    - { direction: send, name: ping, description: Answered with `pong`., example: ping }
    - { direction: receive, name: digest, schema: { $ref: Digest } }
  close:
    4003: The agent lost `messages:read`.
```

A message's string example is a text frame as written; any other example is JSON. The connection examples use `ws://` or `wss://` for the server, send the first `send` message's example, and print what arrives, parsed when every received message is JSON. Browsers can't set WebSocket headers, so a socket with header credentials connects from Node 22 or later in the JavaScript example.

A note without `operation` or `model` stays a guide, such as a page load that has no request of its own.

A GraphQL operation:

```yaml
operation:
  protocol: graphql
  kind: query                  # query, mutation, subscription
  name: pet
  args: [{ name: id, type: ID!, required: true }]
  returns: Pet
  example: { query: "…", variables: { id: p_42 }, response: { data: … } }
```

A model:

```yaml
model:
  name: Pet
  schema:
    type: object
    required: [id, name]
    properties:
      id: { type: string, example: p_42 }
      status: { type: string, enum: [available, adopted] }
      shelter: { $ref: Shelter }
```

Schemas are a JSON Schema subset: `type` (a name or a list with `"null"`), `format`, `enum`, `const`, `default`, `example`, `nullable`, `items`, `properties`, `required`, `additionalProperties`, `oneOf`, `anyOf`, `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems`, `pattern`, and `$ref`. A `$ref` names another note's model; `#/components/schemas/Pet` and `#/$defs/Pet` also resolve to `Pet`. A `null` type or alternative makes a field nullable, and a union lists each alternative with its fields, named by its `title` or the property that tells the alternatives apart (OpenAPI's `discriminator.propertyName`, or one every alternative fixes with a different `const`). Examples come from `example` values first, then `default`, then the first `enum` value, then a placeholder by type.

A parameter takes `type`, `enum`, and `default`, or a full `schema`. `auth` is a scheme or `{ scheme, description, scopes }`. A `source` URL, or list of them, adds "Defined in" links; GitHub and GitLab file links read as `path:line`.

Backticks in descriptions render as code, and `[[Note]]` links. The types are exported as `ApiOperation` and `SchemaNode`. An OpenAPI or GraphQL SDL plugin should emit exactly this shape.

## Develop

```sh
pnpm svartz dev --vault showcase-api
```

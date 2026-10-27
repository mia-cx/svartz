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
| REST operation | Method and path (copyable), auth, the note's own Markdown, parameters by location with defaults and allowed values, request body schema, responses by status with their schemas, and "Defined in" source links. Examples: the request in cURL, JavaScript, and Python (the choice is remembered), and a response per status |
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

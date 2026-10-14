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
| REST operation | Method and path (copyable), auth, parameters by location, request body schema, responses by status with their schemas, the note's own Markdown. Examples: the request in cURL, JavaScript, and Python (the choice is remembered), and a response per status |
| GraphQL operation | Kind, name, arguments, return type, the note's Markdown. Examples: the endpoint, query, variables, and response |
| Model | "The X object": the note's Markdown, an attribute tree, and a generated JSON example |
| Guide | Any other note: plain prose |
| Home | The home note, then one card per resource |
| Resource | `/folders/:resource/` (or your `routes.folders`): models, then operations in path and method order |
| Reference | `/folders/`: every resource and its operations |
| Recently updated | `/feed/` |

Each top-level folder is one sidebar section. A folder note (`graphql/index.md`) names its section, so `GraphQL` doesn't read as `Graphql`.

## Frontmatter

A REST operation:

```yaml
operation:
  protocol: rest
  method: POST
  path: /pets/{petId}/photos
  auth: bearer                 # bearer, basic, none, or any label
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
    - { name: Idempotency-Key, in: header, type: string, description: … }
  requestBody:
    contentType: application/json   # the default
    schema: { $ref: NewPhoto }
    example: { caption: On the beach }   # optional; generated from the schema otherwise
  responses:
    201: { description: Created, schema: { $ref: Photo } }
    404: { description: No pet with this id., schema: { $ref: Error } }
```

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

Schemas are a JSON Schema subset: `type`, `format`, `enum`, `example`, `nullable`, `items`, `properties`, `required`, `oneOf`, `anyOf`, and `$ref`. A `$ref` names another note's model; `#/components/schemas/Pet` also resolves to `Pet`. Examples come from `example` values first, then the first `enum` value, then a placeholder by type.

Backticks in descriptions render as code, and `[[Note]]` links. The types are exported as `ApiOperation` and `SchemaNode`. An OpenAPI or GraphQL SDL plugin should emit exactly this shape.

## Develop

```sh
pnpm svartz dev --vault showcase-api
```

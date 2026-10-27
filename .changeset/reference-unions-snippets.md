---
"@svartz/ui": minor
"@svartz/theme-api-docs": minor
"@svartz/theme-mcp-docs": minor
---

Schema trees list every `oneOf`/`anyOf` alternative with its own fields and required marks, named by its `title` or discriminator value (`kind: webhook`), including inside arrays and nested objects. A `null` type or alternative makes a field nullable: `anyOf: [{ type: string, format: uri }, { type: 'null' }]` reads `string (uri) | null`, and `type: [string, number, null]` keeps both types.

REST request examples no longer assume JSON. They read each success response for what it holds: nothing for a 204 or a response with `empty: true`, text for `contentType: text/markdown`, bytes for `image/png`, JSON otherwise, branching on the status when successes differ. A request body with `contentType: application/x-www-form-urlencoded` or `multipart/form-data` encodes as a form. Only `bearer`, `oauth2`, `openIdConnect`, and `basic` generate an `Authorization` header; other schemes send none. `operation.server` overrides the theme's `baseUrl` for one operation, and `order` frontmatter sorts reference sidebar sections, groups, and pages.

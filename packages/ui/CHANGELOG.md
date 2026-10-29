# @svartz/ui

## 2.1.3

### Patch Changes

- 4cd36f7: Two link labels that share a URL in `nav` or `footer.links` no longer crash the page. The blog footer shows a label in both lists once.

  Vite no longer fails its dependency scan on `ColorModeToggle`, so the first browser test run in a theme stops reloading mid-run.

- @svartz/core@2.1.3
  - @svartz/plugins@2.1.3

## 2.1.2

### Patch Changes

- cbad902: On phones, reference themes show the top bar's project links (`theme.nav`) at the top of the page drawer, since the top bar has no room for them there.
- @svartz/core@2.1.2
  - @svartz/plugins@2.1.2

## 2.1.1

### Patch Changes

- 3209fb1: Jumps to a heading on reference pages, from the contents list or a `#anchor` link, stop below the sticky top bar instead of under it.
- @svartz/core@2.1.1
  - @svartz/plugins@2.1.1

## 2.1.0

### Patch Changes

- @svartz/core@2.1.0
  - @svartz/plugins@2.1.0

## 2.0.0

### Major Changes

- 0c0fb62: Every default theme now extends theme-minimal, and themes compose. Minimal's layout is the one shell. A theme declares only what differs: a frame, any region (header, explorer, page head, right column, page foot, footer), page renderers that claim pages from their frontmatter, list pages, and chrome switches. Regions a theme doesn't swap stay minimal's, and swapped ones receive minimal's shell state: the explorer tree, the current folder path, contents, and previous and next.

  `composeThemes(extensions, config)` from `@svartz/theme-minimal` (build) and `@svartz/theme-minimal/runtime` combines themes in one site. The first theme styles the site. Each page renders with the theme its frontmatter picks: its own `theme:`, then the nearest folder note's, then whichever theme's renderer detects it (`operation`, `model`), then the first theme. A folder note's `theme:` also picks how that folder's page lists. Two themes claiming one page, or an unknown `theme:`, fails the build with the page's path.

  Docs, wiki, and blog keep their look as minimal extensions. Docs keeps its top bar, and symbol pages list in the explorer with kind badges. Wiki keeps its section bar, portal rail, infobox articles, and main page. Blog keeps its header, post feed, and archive. Every one now gets minimal's previous and next links and contents, unless its chrome turns them off.

  The API and MCP themes are minimal extensions with the reference frame: a top bar, minimal's explorer nested at any depth with method and TOOL badges and a filter, and examples in a wide right column. Guides get contents on the right, and every page gets previous and next links. Prerendered pages open the current page's folders and show previous and next without JavaScript. The explorer keeps folders closed when an open folder sits inside a closed one, and the phone drawer focuses its filter, closes on Escape, and makes the page behind it inert.

  Migration: `referenceTheme`, `ReferenceLayout`, `ReferenceNav`, the reference nav model, and the renderer registry are gone from `@svartz/ui/reference`. A site that combined API and MCP pages deletes its `theme/` folder and lists the themes in config:

  ```ts
  theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'], baseUrl: 'https://api.example.com' }
  ```

  Vaults that use one default theme only bump versions.

### Patch Changes

- Updated dependencies [26588ee]
  - @svartz/core@2.0.0
  - @svartz/plugins@2.0.0

## 1.2.1

### Patch Changes

- ce77637: The reference sidebar nests folders as a real tree: `Reference > Public API > Authentication` instead of peer groups titled `Public API / Authentication`. Each folder shows its own name, closing a folder hides everything under it, and the current page's folders open on arrival. Folders a reader opens or closes stay that way across pages, the filter opens the path to each match, and clearing it restores the reader's choices.

  `ReferenceNavSection` now holds `links` and nested `folders` (`ReferenceNavFolder`) instead of flat `groups`; `ReferenceNavGroup` is gone. `readingOrder` and `folderTrail` are new.

- @svartz/core@1.2.1
  - @svartz/plugins@1.2.1

## 1.2.0

### Minor Changes

- 1debbc9: Schema trees list every `oneOf`/`anyOf` alternative with its own fields and required marks, named by its `title` or discriminator value (`kind: webhook`), including inside arrays and nested objects. A `null` type or alternative makes a field nullable: `anyOf: [{ type: string, format: uri }, { type: 'null' }]` reads `string (uri) | null`, and `type: [string, number, null]` keeps both types.

  REST request examples no longer assume JSON. They read each success response for what it holds: nothing for a 204 or a response with `empty: true`, text for `contentType: text/markdown`, bytes for `image/png`, JSON otherwise, branching on the status when successes differ. A request body with `contentType: application/x-www-form-urlencoded` or `multipart/form-data` encodes as a form. Only `bearer`, `oauth2`, `openIdConnect`, and `basic` generate an `Authorization` header; other schemes send none. `operation.server` overrides the theme's `baseUrl` for one operation, and `order` frontmatter sorts reference sidebar sections, groups, and pages.

### Patch Changes

- @svartz/core@1.2.0
  - @svartz/plugins@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1
  - @svartz/plugins@1.1.1

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.
- c2b31c8: Notes and folders can set their place in the explorer and the wiki section bar with an `order` number in their frontmatter, lowest first. A folder takes its folder note's `order`; anything without one follows in title order.
- 6a78dcc: New `@svartz/theme-mcp-docs` documents MCP tools: input and output schemas, annotations, and `tools/call` examples that label tool errors and JSON-RPC errors apart. It and `@svartz/theme-api-docs` now share one reference shell from `@svartz/ui/reference`, so one site can combine REST, GraphQL, and MCP pages with `referenceTheme({ renderers: [...apiRenderers, ...mcpRenderers] })`. Each page's `operation.protocol` or `model` metadata picks its renderer, and metadata no renderer can read fails the build with the page's path. The sidebar gains a filter, nested folder groups, and fixed-width method badges beside each path. Operation pages show defaults, allowed values, limits, and "Defined in" source links.

### Patch Changes

- Updated dependencies [67b759b]
  - @svartz/plugins@1.1.0
  - @svartz/core@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [dd069ad]
- Updated dependencies [6dd3049]
  - @svartz/plugins@1.0.1
  - @svartz/core@1.0.1

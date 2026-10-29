# @svartz/theme-docs

## 2.1.3

### Patch Changes

- 4cd36f7: Two link labels that share a URL in `nav` or `footer.links` no longer crash the page. The blog footer shows a label in both lists once.

  Vite no longer fails its dependency scan on `ColorModeToggle`, so the first browser test run in a theme stops reloading mid-run.

- Updated dependencies [4cd36f7]
  - @svartz/theme-minimal@2.1.3
  - @svartz/ui@2.1.3
  - @svartz/core@2.1.3

## 2.1.2

### Patch Changes

- Updated dependencies [cbad902]
  - @svartz/ui@2.1.2
  - @svartz/theme-minimal@2.1.2
  - @svartz/core@2.1.2

## 2.1.1

### Patch Changes

- Updated dependencies [3209fb1]
  - @svartz/ui@2.1.1
  - @svartz/theme-minimal@2.1.1
  - @svartz/core@2.1.1

## 2.1.0

### Patch Changes

- @svartz/core@2.1.0
  - @svartz/ui@2.1.0
  - @svartz/theme-minimal@2.1.0

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
- Updated dependencies [0c0fb62]
  - @svartz/core@2.0.0
  - @svartz/theme-minimal@2.0.0
  - @svartz/ui@2.0.0

## 1.2.1

### Patch Changes

- Updated dependencies [ce77637]
  - @svartz/ui@1.2.1
  - @svartz/core@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies [1debbc9]
  - @svartz/ui@1.2.0
  - @svartz/core@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1
  - @svartz/ui@1.1.1

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.

### Patch Changes

- Updated dependencies [67b759b]
- Updated dependencies [c2b31c8]
- Updated dependencies [6a78dcc]
  - @svartz/core@1.1.0
  - @svartz/ui@1.1.0

## 1.0.1

### Patch Changes

- @svartz/ui@1.0.1
  - @svartz/core@1.0.1

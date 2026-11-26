---
title: "Theme contract"
description: "Look up theme exports, layouts, routes, features, and inheritance."
---

Publish a build manifest and a runtime entry, or point `theme.base` at a local theme. The [[guides/create-theme|theme authoring guide]] shows the package shape. `defineTheme` checks the manifest; the major of `contractVersion` must match `CONTRACT_VERSION` (currently `1.0.0`).

## Manifest fields

| Field | Use |
| --- | --- |
| `id`, `version`, `contractVersion` | Required strings for identity and compatibility. |
| `layouts` | Loader map; requires `defaultPage` and `notePage`. |
| `routes` | List of route definitions. A route with ID `note` and a `:slug` parameter is required. |
| `displayName`, `description`, `author`, `homepage` | Optional metadata strings. |
| `components` | Optional registry of named component loaders. |
| `capabilities` | Optional boolean flags: `callouts`, `wikilinks`, `embeds`, `codeBlocks`, `syntaxHighlighting`, `math`, `toc`, `backlinks`, `graph`, `search`. |
| `requiredFeatures` | Required transformations: values from `gfm`, `ofm`, `syntaxHighlighting`, `math`, `embeds`, `toc`. Different from capabilities. |
| `artifactRequirements` | Optional flags `index`, `graph`, `backlinks` and list `custom`. The index carries search and the table of contents. |
| `pluginPreset` | Optional `{ plugins }`, merged between core plugins and user plugins. |
| `socialImage(metadata)` | Optional function returning complete SVG; receives `title`, optional `description`, and `siteTitle`. |
| `faviconSvg` | Optional fallback SVG string. |
| `defaults`, `hooks` | Optional theme-defined records. |

A component loader is `{ default: Component }` or a function that resolves to it. Standard layout slots after the two required ones are `root`, `tagPage`, `folderPage`, `feedPage`, and `notFoundPage`; themes can name additional slots. Named component entries include `callout`, `codeBlock`, `image`, `link`, `embed`, `backlinks`, `graphPanel`, `searchBox`, `toc`, and `noteHeader`.

A route has a required `id` and `pattern`, and can choose `layoutSlot` or `component`, `priority`, `prerender`, and `meta`. See the [theme source types and matcher](https://github.com/mia-cx/svartz/tree/main/packages/core/src/theme) for signatures and matching rules.

## Extend or compose

To author a theme on top of `@svartz/theme-minimal`, export `extensions` and pass them to `composeThemes(extensions, config, identity)` from `@svartz/theme-minimal` and `@svartz/theme-minimal/runtime`. In config, `theme.base: [first, second]` composes installed themes; the first provides the site shell and tokens. `theme.routes` renames listing URL prefixes (`tags`, `folders`, and `feed`). Note renderers are chosen by note or folder-note `theme` frontmatter or each renderer's `detect` function, without changing the note's URL. See [[themes/choosing-and-composing|Choose and combine themes]] for matching and [[themes/minimal|Minimal]] for the shell first-party themes extend.

Keep `data-svartz-note` on rendered note bodies and the page and site action regions in custom layouts that support browser plugins. The [[guides/create-plugin#Add actions to every page|browser action contract]] describes what mounts there.

API reference: [[reference/api/core/defineTheme|defineTheme]], [[reference/api/core/SvartzTheme|SvartzTheme]], and [[reference/api/theme-minimal/runtime/index|@svartz/theme-minimal/runtime]].

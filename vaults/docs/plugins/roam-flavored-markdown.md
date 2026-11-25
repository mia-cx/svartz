---
title: "Roam Markdown"
description: "Render common Roam Research syntax in a vault."
---

Run `npm install -D @svartz/plugins`, import `roamFlavoredMarkdown` from `@svartz/plugins`, and add `plugins: [roamFlavoredMarkdown()]` to the vault. Nothing goes in frontmatter.

All options are optional booleans and default to `true`:

| Option | Syntax it enables |
| --- | --- |
| `orComponent` | `{{or:...}}` choices |
| `TODOComponent`, `DONEComponent` | Roam TODO and DONE controls |
| `videoComponent`, `audioComponent`, `pdfComponent` | The respective media embeds |
| `blockquoteComponent` | `[[>]]` quote syntax |

For example, `roamFlavoredMarkdown({ videoComponent: false })` leaves video markers unconverted. The plugin also handles Roam's underscore italics and highlights. Media accepts relative paths and HTTP(S) URLs. This is a syntax subset; it does not import a Roam database. It preserves code samples.

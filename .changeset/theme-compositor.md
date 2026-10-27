---
"@svartz/theme-minimal": major
"@svartz/ui": major
"@svartz/theme-api-docs": major
"@svartz/theme-mcp-docs": major
---

Every default theme now extends theme-minimal, and themes compose. Minimal's layout is the one shell. A theme declares only what differs: a frame, any region (header, explorer, page head, right column, page foot, footer), page renderers that claim pages from their frontmatter, list pages, and chrome switches. Regions a theme doesn't swap stay minimal's, and swapped ones receive minimal's shell state: the explorer tree, the current folder path, contents, and previous and next.

`composeThemes(extensions, config)` from `@svartz/theme-minimal` (build) and `@svartz/theme-minimal/runtime` combines themes in one site. The first theme styles the site. Each page renders with the theme its frontmatter picks: its own `theme:`, then the nearest folder note's, then whichever theme's renderer detects it (`operation`, `model`), then the first theme. A folder note's `theme:` also picks how that folder's page lists. Two themes claiming one page, or an unknown `theme:`, fails the build with the page's path.

The API and MCP themes are minimal extensions with the reference frame: a top bar, minimal's explorer nested at any depth with method and TOOL badges and a filter, and examples in a wide right column. Guides get contents on the right, and every page gets previous and next links. Prerendered pages open the current page's folders and show previous and next without JavaScript. The explorer keeps folders closed when an open folder sits inside a closed one, and the phone drawer focuses its filter, closes on Escape, and makes the page behind it inert.

Migration: `referenceTheme`, `ReferenceLayout`, `ReferenceNav`, the reference nav model, and the renderer registry are gone from `@svartz/ui/reference`. A site that combined API and MCP pages composes the themes' `extensions` instead:

```js
// theme/runtime.js
import { composeThemes } from '@svartz/theme-minimal/runtime';
import { extensions as api } from '@svartz/theme-api-docs/runtime';
import { extensions as mcp } from '@svartz/theme-mcp-docs/runtime';
export default (config) => composeThemes([...api, ...mcp], config, { id: '@acme/docs-theme' });

// theme/index.js
import { composeThemes } from '@svartz/theme-minimal';
import { extensions as api } from '@svartz/theme-api-docs';
import { extensions as mcp } from '@svartz/theme-mcp-docs';
export default (config) => composeThemes([...api, ...mcp], config, { id: '@acme/docs-theme' });
```

Vaults that use one default theme only bump versions.

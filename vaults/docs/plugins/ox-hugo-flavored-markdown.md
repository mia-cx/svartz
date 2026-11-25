---
title: "ox-hugo Markdown"
description: "Publish exported Org notes without running Hugo."
---

Export your Org files with ox-hugo first. Run `npm install -D @svartz/plugins` and add `oxHugoFlavoredMarkdown()` in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { oxHugoFlavoredMarkdown } from "@svartz/plugins";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      plugins: [oxHugoFlavoredMarkdown()],
    },
  ],
});
```

Svartz reads ordinary YAML or TOML frontmatter; there are no plugin-specific keys.

All options are optional booleans and default to `true`:

| Option | Conversion |
| --- | --- |
| `wikilinks` | Turn relrefs into links Svartz can resolve |
| `removePredefinedAnchor` | Remove exported heading anchors |
| `removeHugoShortcode` | Strip remaining Hugo shortcode delimiters, keeping their inner text |
| `replaceFigureWithMdImg` | Turn figures into Markdown images |
| `replaceOrgLatex` | Normalize exported Org math |

For example, `oxHugoFlavoredMarkdown({ removePredefinedAnchor: false })` retains the exported anchors. The plugin does not run Hugo or execute shortcodes. It leaves executable `.svx` source and code examples alone.

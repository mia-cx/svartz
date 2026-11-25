---
title: "ox-hugo Markdown"
description: "Publish exported Org notes without running Hugo."
---

Export your Org files with ox-hugo first. Run `npm install -D @svartz/plugins`, import `oxHugoFlavoredMarkdown` from `@svartz/plugins`, and set `plugins: [oxHugoFlavoredMarkdown()]` on the vault. Svartz reads ordinary YAML or TOML frontmatter; there are no plugin-specific keys.

All options are optional booleans and default to `true`:

| Option | Conversion |
| --- | --- |
| `wikilinks` | Turn relrefs into links Svartz can resolve |
| `removePredefinedAnchor` | Remove exported heading anchors |
| `removeHugoShortcode` | Remove remaining Hugo shortcodes |
| `replaceFigureWithMdImg` | Turn figures into Markdown images |
| `replaceOrgLatex` | Normalize exported Org math |

For example, `oxHugoFlavoredMarkdown({ removePredefinedAnchor: false })` retains the exported anchors. The plugin does not run Hugo or execute shortcodes. It leaves executable `.svx` source and code examples alone.

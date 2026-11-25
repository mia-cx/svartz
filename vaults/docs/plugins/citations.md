---
title: "Citations"
description: "Resolve citation keys against one or more bibliographies."
---

Run `npm install -D @svartz/plugins`, import `citations` from `@svartz/plugins`, and add `plugins: [citations()]` to the vault. Put `bibliography.bib` in the vault root. Cite an entry with `[@sensor2026]`. No frontmatter is required.

| Option | Type | Default |
| --- | --- | --- |
| `bibliographyFile` | String or list of strings; paths relative to the vault | `"./bibliography.bib"` |
| `csl` | String: citation style name or CSL file path | `"apa"` |
| `linkCitations` | Boolean | `false` |
| `suppressBibliography` | Boolean | `false` |

For example, `citations({ bibliographyFile: "references/sensors.bib", linkCitations: true })` links citations to their entries. The build fails if a bibliography is missing. A note's bibliography lists only entries that note cites.

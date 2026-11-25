---
title: "Citations"
description: "Resolve citation keys against one or more bibliographies."
---

Run `npm install -D @svartz/plugins` and add `citations()` in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { citations } from "@svartz/plugins";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      plugins: [citations()],
    },
  ],
});
```

Put `bibliography.bib` in the vault root and cite an entry with `[@sensor2026]`. No frontmatter is required.

| Option | Type | Default |
| --- | --- | --- |
| `bibliographyFile` | String or list of strings; paths relative to the vault | `"./bibliography.bib"` |
| `csl` | String; citation style name or CSL file path | `"apa"` |
| `linkCitations` | Boolean | `false` |
| `suppressBibliography` | Boolean | `false` |

For example, `citations({ bibliographyFile: "references/sensors.bib", linkCitations: true })` links citations to their entries. The build fails if a bibliography is missing. A note's bibliography lists only entries that note cites.

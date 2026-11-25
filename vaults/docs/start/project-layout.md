---
title: "Project layout"
description: "Find the config, source vaults, and generated build files."
---

A standalone project needs a config and a vault. Svartz ships the app that turns the vault into a site.

```text
svartz.config.ts
package.json
vault/
  index.md
.svartz/
  vaults/notes/
    artifacts/
    dist/
    .svelte-kit/
```

| Path | Contents |
| --- | --- |
| `svartz.config.ts` | Vault IDs, source paths, themes, and targets. See the [[reference/configuration|configuration reference]]. |
| `vault/` | Notes and their attachments. Open this folder in Obsidian. |
| `.svartz/vaults/<id>/` | Standalone build workspace, generated artifacts, and adapter output. Do not edit it. |
| `.svartz/host/` | Generated registry in a SvelteKit host project. |

A config can describe several vaults. Add another entry to `vaults` with its own `id`, `path`, and `target`. Use `svartz build --vault <id>` to build one standalone vault, or `svartz build` to build them all.

Use a different `outDir` parent for each vault if you change the default. Svartz puts build state beside that directory and rejects overlapping build workspaces.

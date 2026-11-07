---
'@svartz/core': minor
'@svartz/config': minor
'@svartz/vite': minor
---

A plugin can answer requests at runtime: give it `server: { module, options }` and a standalone vault on `cloudflare-workers`, `cloudflare-pages` or `node` routes `/_svartz/<plugin-id>/` to its handler while pages stay prerendered. A `static` vault with such a plugin fails the build, naming the vault and plugin. Secrets in options are named with `{ env: "NAME" }`. See `docs/server-plugins.md`.

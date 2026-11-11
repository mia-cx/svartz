---
'@svartz/core': minor
'@svartz/vite': minor
'svartz': minor
---

Server plugins reach their Cloudflare bindings under `svartz dev`. A vault on `cloudflare-workers`, `cloudflare-pages`, or a host app on `@sveltejs/adapter-cloudflare` gets the D1 databases, other bindings, `vars` and `.dev.vars` secrets of the `wrangler.jsonc` (or `.json`, `.toml`) beside `svartz.config.ts` in `context.env`. Local data persists in `.wrangler/state` beside that config, where `wrangler d1 execute --local` reads it. See "Bindings under `svartz dev`" in `docs/server-plugins.md`.

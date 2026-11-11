---
'@svartz/plugin-annotations': minor
---

New package: `@svartz/plugin-annotations` shows readers' comments beside the passage they respond to, to every reader, signed in or not. `annotations({ database: { env: "DB" } })` stores them in Cloudflare D1 and creates its tables on the first request; `attach(element, { endpoint, page })` highlights each passage and opens its comment from a marker in the margin.

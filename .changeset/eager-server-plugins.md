---
"@svartz/core": minor
"@svartz/vite": minor
---

A server plugin can start before everything else. With `server: { module, eager: true }`, its factory runs before the site answers its first request at runtime (a page, a plugin or one of the app's own routes), instead of on its own first request. Use it for a plugin whose factory sets up what other code reads. `@svartz/auth` is eager, so accounts are always read with the deployed `admins`.

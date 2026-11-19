---
"@svartz/core": minor
"@svartz/vite": minor
---

A server plugin can start before the others. With `server: { module, eager: true }`, its factory runs before any of the vault's plugins answers its first request, instead of on its own first request. Use it for a plugin whose factory sets up what other plugins read. `@svartz/auth` is eager, so a plugin that reads accounts always sees the deployed `admins`.

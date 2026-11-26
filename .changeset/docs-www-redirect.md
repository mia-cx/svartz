---
"@svartz/vite": patch
---

Standalone Cloudflare Workers can list apex domains in the Wrangler `SVARTZ_WWW_REDIRECT_HOSTS` variable to redirect their `www` aliases before serving pages or assets. The production Svartz docs use this for `svartz.dev`, `svartz.com`, and `svartz.app`.

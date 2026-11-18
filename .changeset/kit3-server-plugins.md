---
"@svartz/core": patch
"@svartz/vite": patch
---

Server plugins work under SvelteKit 3. They read the process env on Node, and the Worker's `env` and `waitUntil` from `cloudflare:workers` on Cloudflare, since SvelteKit 3's `$env/dynamic/private` holds only declared variables and its `platform` carries no `env` or `ctx`. Markdown negotiation runs ahead of adapter-node 6's static files, and `sequence(svartzHandle, …)` no longer fails with "Could not get the request store" under adapter-cloudflare in dev. Late SvelteKit 2 releases are no longer mistaken for SvelteKit 3, so their adapter is read from `kit.adapter`.

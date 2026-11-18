---
"@svartz/core": patch
"@svartz/vite": patch
---

Server plugins work under SvelteKit 3. They read the process env on Node, and the Worker's `env` and `waitUntil` from `cloudflare:workers` on Cloudflare, since SvelteKit 3's `$env/dynamic/private` holds only declared variables and its `platform` carries no `env` or `ctx`; under `svartz dev` they also read the app's `.env`. Browser code that imports `virtual:svartz/server` fails the build, so plugin modules and options never reach client chunks. Markdown negotiation runs ahead of adapter-node 6's static files, and `sequence(svartzHandle, …)` no longer fails with "Could not get the request store" under adapter-cloudflare in dev. Svartz tells SvelteKit 2 from 3 by the version the app installs, and reads the adapter from `sveltekit({ adapter })` or `svelte.config.js`'s `kit.adapter` under either.

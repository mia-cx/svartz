---
"@svartz/ui": patch
"@svartz/vite": minor
"svartz": minor
---

Render Svartz pages in SvelteKit 3 hosts. `virtual:svartz/host` exports SvelteKit's `base` and `assets`, which SvelteKit 3's `$app/paths` dropped; the generated catchall and `noteStylesheets` read them there, so they build on SvelteKit 2 and 3. Run `svartz init` to upgrade an existing generated catchall. A SvelteKit 3 host that sets `adapter-cloudflare` in `sveltekit({ adapter })` now gets its Wrangler bindings under `svartz dev`. `@svartz/vite` adds `svelteKitPaths`, which reads SvelteKit's `assets` as well as its `base`.

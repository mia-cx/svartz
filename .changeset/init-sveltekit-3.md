---
"svartz": minor
---

`svartz init` scaffolds a SvelteKit 3 project: Vite 8, `@sveltejs/vite-plugin-svelte` 7, `@sveltejs/adapter-static` 4 and TypeScript 6, with the SvelteKit config passed to `sveltekit()` in `vite.config.ts` instead of `svelte.config.js`. A new project needs Node `^22.17.0 || >=24.0.0`: its `package.json` says so, and `svartz init` stops on an older Node before writing anything. Existing SvelteKit 2 apps keep working as hosts. The Cloudflare Pages target builds with `@sveltejs/adapter-cloudflare` directly.

---
"svartz": patch
"@svartz/vite": patch
---

A standalone `cloudflare-workers` build now produces a worker that Wrangler can bundle and deploy. Before, the worker imported its server by a path that held only from `apps/web/.svelte-kit`, the symlink the CLI puts in place during a build, so bundling `.svartz/vaults/<id>/.svelte-kit/cloudflare/_worker.js` failed with `Could not resolve`. The build now copies `apps/web/wrangler.jsonc` to `.svartz/vaults/<id>/wrangler.jsonc` and builds against that copy, so the worker resolves its imports from where it lands. Deploy with `npx wrangler deploy` from `.svartz/vaults/<id>`.

The deployed worker also serves Svartz's own static files, such as each page's `.md` copy and attachments. Workers run the worker ahead of every asset, and SvelteKit's worker served only SvelteKit's files, so a request negotiated to Markdown was redirected to a copy that answered 404.

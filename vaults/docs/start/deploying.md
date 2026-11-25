---
title: "Deploy a vault"
description: "Build a standalone site for static hosting, Node, Workers, or Pages, or use a SvelteKit host."
---

Change the vault's `target` in `svartz.config.ts`. Set `site.url` to the public URL if you want absolute canonical links, feeds, and sitemaps. Build with `npx svartz build --vault notes`. Substitute your vault ID for `notes` in the commands below.

## Static

Set `target: { type: "static" }` and publish `.svartz/vaults/notes/dist/` to your static host. This target cannot run [[plugins/server-plugins|server plugins]].

For a site under `/notes`, set `target: { type: "static", basePath: "/notes" }` and use that same prefix in `site.url`. Configure the host to serve the site under that path.

## Node

Set `target: { type: "node" }`. Run `node .svartz/vaults/notes/dist/index.js` to serve the build. This target also supports `basePath`. Deploy with any runtime dependencies your site uses.

## Cloudflare Workers

Give each vault its own Worker name and route:

```ts
target: {
  type: "cloudflare-workers",
  name: "garden-notes",
  routes: [{ pattern: "notes.example.com", custom_domain: true }],
},
site: { url: "https://notes.example.com" },
```

After building, deploy with the Wrangler file for that vault:

```sh
npx wrangler deploy --config .svartz/vaults/notes/wrangler.json
```

Set routes, compatibility flags, bindings such as `d1_databases`, public `vars`, and `env` on the target. A route can be a pattern string or an object with `pattern` and a zone or `custom_domain`. See [[reference/wrangler|Wrangler fields]] for types and defaults. Svartz writes `main` and forces the generated assets directory, `ASSETS` binding, and Worker-first routing. Do not supply `main`.

For local development, put secrets in `.dev.vars` beside the Svartz config. Supply production secrets to the Worker separately.

## Cloudflare Pages

Set `target: { type: "cloudflare-pages" }`. Deploy the adapter output to an existing Pages project:

```sh
npx wrangler pages deploy .svartz/vaults/notes/.svelte-kit/cloudflare --project-name garden-notes
```

Keep runtime bindings in the Pages project's configuration. For local development, use the Wrangler config beside `svartz.config.ts`. Svartz accepts `target.projectName`, but does not use it to deploy.

## Existing SvelteKit app

Set `target: { type: "host" }` and use the app's own adapter and deployment commands. Use `mountPath` to choose where the vault sits in the app. See [[guides/host-vaults|Host Svartz in SvelteKit]].

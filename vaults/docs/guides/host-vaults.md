---
title: "Publish vaults in a SvelteKit app"
description: "Mount two vaults without replacing the app's own routes or adapter."
---

Use this when you already run a SvelteKit app. For an independent site, [[start/first-site|initialize a standalone vault]] instead.

## 1. Initialize in the app

From the folder with your SvelteKit app and Vite config, run `npx svartz@latest init`. Keep the adapter and routes you already have. If your app uses Tailwind CSS, it must be Tailwind CSS 4. Init wraps your Vite config with `withSvartzHost`, adds virtual-module types and `svartz:dev`, `svartz:build`, and `svartz:preview` scripts, and adds the generated catchall if you do not have one. An existing catchall stays yours; merge in the generated behavior if you want it to render notes. If init reports a file conflict, resolve it before rerunning.

## 2. Give the vaults separate mounts

Create `vault/index.md` and `handbook/index.md`. Configure both mounts in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    { id: "notes", path: "vault", mountPath: "/notes", target: { type: "host" } },
    { id: "handbook", path: "handbook", mountPath: "/handbook", target: { type: "host" } },
  ],
});
```

Mounts cannot overlap. App routes still win. For example, `src/routes/notes/about/+page.svelte` takes precedence over the vault's `about.md`. Links and attachments use their vault's mount. Each vault can choose its own theme, publication settings, and discovery outputs.

## 3. Build and check both mounts

```sh
npm run svartz:dev
npm run svartz:build
```

Use `svartz:dev` first to open `/notes/`, `/handbook/`, and an existing app route. Then stop dev and build. Deploy your app's adapter output as usual. `npx svartz build --vault notes` still builds both host vaults because they share one app. Non-host vaults in the same config build separately.

## Use your own layout

An index-only host can import `virtual:svartz/index` without pulling in Svartz's UI or compiling a theme. Each public, unprotected entry exposes `entry.markdownHref` when `discovery.llms.enabled` is on (the default). Set `index: { markdown: true }` on the vault to also include each note's portable Markdown body as `entry.markdown` for custom rendering. The [[reference/vault-view|vault view reference]] shows both ways to read notes. When rendering `SvartzRuntimePage` in a custom route, import `virtual:svartz/tailwind-sources.css` and await `prepareHostVault` in universal `load`.

## Add server features

Use a server adapter, then add `svartzHandle` first in `src/hooks.server.ts`. For example, if you have no other handle:

```ts
export { svartzHandle as handle } from "virtual:svartz/server";
```

If your app already has a handle, use `sequence(svartzHandle, handleApp)` from `@sveltejs/kit/hooks`. Init adds the dynamic `[...mount=svartzMount]/-/[...page=svartzPage]/` route and its parameter matchers for supported server adapters. If you kept your own files, see the [route and matcher source](https://github.com/mia-cx/svartz/blob/sveltekit-rewrite/docs/host-vaults.md#plugin-pages) to integrate them. See [[plugins/server-plugins|Server plugins]] for runtime routes, prerendering, and dev bindings.

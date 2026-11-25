---
title: "Publish vaults in a SvelteKit app"
description: "Mount two vaults without replacing the app's own routes or adapter."
---

Use this when you already run a SvelteKit app. For an independent site, [[start/first-site|initialize a standalone vault]] instead.

## 1. Initialize in the app

From the folder with your SvelteKit app and Vite config, run `npx svartz@latest init`. Keep the adapter and routes you already have. Init wraps your Vite config with `withSvartzHost`, adds virtual-module types and Svartz scripts, and adds the generated catchall if you do not have one. An existing catchall stays yours; merge in the generated behavior if you want it to render notes. If init reports a file conflict, resolve it before rerunning.

## 2. Give the vaults separate mounts

Create `vault/index.md` and `handbook/index.md`. In `svartz.config.ts`, keep the generated `version` and set `vaults`:

```ts
vaults: [
  { id: "notes", path: "vault", mountPath: "/notes", target: { type: "host" } },
  { id: "handbook", path: "handbook", mountPath: "/handbook", target: { type: "host" } },
],
```

Mounts cannot overlap. App routes still win: `src/routes/notes/about/+page.svelte` takes precedence over the vault's `about.md`. Links and attachments use their vault's mount. Each vault can choose its own theme, publication settings, and discovery outputs.

## 3. Build and check both mounts

```sh
npx svartz dev
npx svartz build
```

Use dev first to open `/notes/`, `/handbook/`, and an existing app route. Then stop dev and build. Deploy your app's adapter output as usual. `--vault notes` still builds both host vaults; they share an app. Non-host vaults in the same config build separately.

## Use your own layout

An index-only host can import `virtual:svartz/index` without pulling in Svartz's UI or compiling a theme. Use this path for index-only integrations in SvelteKit 3. Set `index: { markdown: true }` on the vault to link its published Markdown. The [[reference/vault-view|vault view reference]] shows both ways to read notes. When rendering `SvartzRuntimePage` in a custom route, import `virtual:svartz/tailwind-sources.css` and await `prepareHostVault` in universal `load`.

## Add server features

Use a server adapter, then add `svartzHandle` first in `src/hooks.server.ts`. For example, if you have no other handle:

```ts
export { svartzHandle as handle } from "virtual:svartz/server";
```

If your app already has a handle, use `sequence(svartzHandle, handleApp)` from `@sveltejs/kit/hooks`. Init adds the dynamic `[...mount=svartzMount]/-/[...page=svartzPage]/` route and its parameter matchers for supported server adapters. If you kept your own files, see the [route and matcher source](https://github.com/mia-cx/svartz/blob/sveltekit-rewrite/docs/host-vaults.md#plugin-pages) to integrate them. See [[plugins/server-plugins|Server plugins]] for runtime routes, prerendering, and dev bindings.

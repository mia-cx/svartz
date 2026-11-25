---
title: "Server plugins"
description: "Handle requests or render live pages alongside prerendered notes."
---

Use a `node`, `cloudflare-workers`, or `cloudflare-pages` target, or a [[guides/host-vaults#Add server features|host with a server adapter and svartzHandle]]. The shipped app already wires the handler. Static targets reject active plugins with a server module.

## Answer a request

Register the module on the vault's plugin in `svartz.config.ts`. The module path is absolute, a `file:` URL, or a package specifier.

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "node" },
      plugins: [
        {
          id: "hello",
          server: { module: new URL("./server/hello.ts", import.meta.url).href },
        },
      ],
    },
  ],
});
```

```ts
// server/hello.ts
import type { ServerModuleFactory } from "@svartz/core";

const hello: ServerModuleFactory = () => (_request, context) =>
  Response.json({ site: context.vault.site.title });

export default hello;
```

After starting `svartz dev`, open `/_svartz/hello/` below the vault's mount. Handler paths include the deployment base, mount, and `/_svartz/<id>/`. Use trailing slashes. An unknown ID or an `undefined` response gives 404. The factory normally runs once, on first use; `server.eager: true` runs it before the first runtime request. No handler runs during prerendering.

## Render a page or dashboard panel

Declare `server.pages: ["greet"]` to claim `/-/greet/` and paths below it. The factory returns an object with `page(request, context)` and, optionally, `handle`. A page returns `{ title, html }`, `{ redirect }` for a same-site 303, or `undefined` for 404. Escape user or provider content before putting it in HTML. These responses use `Cache-Control: private, no-store` and `noindex`; notes stay prerendered. Another plugin or note cannot claim the same path subtree.

With [[plugins/auth|auth]], a factory can return `dashboard: { title, panels }`. Each panel supplies `id`, `title`, `permission`, and `render(request, context)` and mounts under `/-/dashboard/<plugin>/<panel>/`. The dashboard checks permission to render; the handler must also check permission to perform each write.

## Configure the server

Pass plain JSON in `server.options`. Refer to secrets as `{ env: "PRIVATE_HELLO_TOKEN" }` and read the value from `context.env` per request. A hook can also put build data in `getCompilerContributions(ctx).serverData` under the plugin ID; the factory receives it as its second argument. Neither options nor build data belongs in the browser bundle.

| Context field | Value |
| --- | --- |
| `env` | Cloudflare bindings and secrets or the Node environment |
| `clientAddress` | IP address, when the adapter supplies one |
| `vault` | Public site settings, ID, and mount path |
| `base` | Answering plugin's route prefix, without a trailing slash |
| `waitUntil(promise)` | Continue work after sending the response |
| `dashboard()` | Registered panels; does not check permission |
| `path` | Path relative to the page or panel root |

In dev, Workers use the target's Wrangler bindings. Pages and Cloudflare hosts read `wrangler.json`, `wrangler.jsonc`, or `wrangler.toml` beside the config. Put local secrets in `.dev.vars` there. `CLOUDFLARE_ENV` selects named Wrangler bindings and `.dev.vars.<name>` when present. Data in local Wrangler state survives restarts. See [[reference/wrangler|Wrangler settings]].

The adapter's CSRF checks apply to plugin requests. Use same-origin forms and set `ORIGIN` for a Node deploy. During prerendering, plugin URLs answer 404. The standalone crawler skips those URLs; when host notes link to them, configure your host's `prerender.handleHttpError` to skip those known runtime paths, not all 404s.

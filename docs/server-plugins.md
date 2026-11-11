# Server plugins

A plugin can answer requests at runtime. Give it a `server` module, and Svartz routes every request under `/_svartz/<plugin-id>/` to that module's handler. Pages stay prerendered. The platform also negotiates their [Markdown copies](discovery.md#markdown-for-llm-agents) before serving static HTML.

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "wiki",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [{
      id: "hello",
      server: {
        module: fileURLToPath(new URL("./server/hello.ts", import.meta.url)),
        options: { greeting: "Hi", token: { env: "PRIVATE_HELLO_TOKEN" } },
      },
    }],
  }],
});
```

## The module

The module's default export is a factory. Svartz calls it once, with the plugin's `options`, on the plugin's first request. It returns the handler, which takes a standard `Request` and returns a `Response`. Returning `undefined` answers 404.

```ts
import type { ServerModuleFactory } from "@svartz/core";

type Options = { greeting: string; token: { env: string } };

const hello: ServerModuleFactory<Options> = (options) => (request, context) => {
  const path = new URL(request.url).pathname.slice(context.base.length);
  if (path !== "/") return undefined;
  const token = context.env[options.token.env];
  if (typeof token !== "string" || !token) {
    return Response.json({ error: "misconfigured", message: "The server has no token." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized", message: "Send the token." }, { status: 401 });
  }
  return Response.json({ message: `${options.greeting} from ${context.vault.site.title}` });
};

export default hello;
```

`module` is an absolute path, a `file:` URL, or a package specifier such as `@acme/svartz-hello/server`. Relative paths are refused because they have no fixed base. A plugin package can export its server entry or pass `fileURLToPath(new URL("./server.js", import.meta.url))`.

The handler receives a `context`:

| Field | Value |
| --- | --- |
| `env` | The platform's env on Cloudflare (vars, secrets and bindings); the server's environment variables on Node, minus `PUBLIC_` ones. Under `svartz dev`, the dev server's environment variables and `.env`, plus the project's Wrangler bindings on Cloudflare (see [bindings under `svartz dev`](#bindings-under-svartz-dev)). |
| `clientAddress` | The client's IP address, or `undefined` when the adapter can't tell. |
| `vault` | The vault's `id`, `mountPath` and public `site` settings. |
| `base` | The path the plugin answers under, without a trailing slash, such as `/_svartz/hello`. |
| `waitUntil(promise)` | Keeps work running after the response. On Cloudflare it is the platform's `waitUntil`; on Node the promise runs on and a failure is logged. |

Errors the handler throws reach SvelteKit's `handleError` and answer 500.

## Options and secrets

Options must be JSON: strings, finite numbers, booleans, `null`, arrays and plain objects. They are written into the server bundle and never into the browser bundle.

Never put a secret in options. Name its environment variable with `{ env: "NAME" }` and read it per request from `context.env[name]`. An object with an `env` key must have no other keys. Names with the browser-public `PUBLIC_` or `VITE_` prefixes fail the build, as they do for [password groups](encrypted-notes.md). Set the value on the server: `wrangler secret put PRIVATE_HELLO_TOKEN` for Workers, or the process environment for Node.

## Bindings under `svartz dev`

A vault that deploys to Cloudflare (`cloudflare-workers`, `cloudflare-pages`, or `host` in an app on `@sveltejs/adapter-cloudflare`) reads its bindings in dev from the Wrangler config beside `svartz.config.ts`: `wrangler.json`, `wrangler.jsonc` or `wrangler.toml`.

```jsonc
// wrangler.jsonc
{
  "name": "wiki",
  "compatibility_date": "2026-03-03",
  "vars": { "GREETING": "Hi" },
  "d1_databases": [{ "binding": "DB", "database_name": "wiki", "database_id": "<id>" }]
}
```

On the first plugin request, `svartz dev` starts Wrangler's local platform and adds its bindings, `vars` and `.dev.vars` secrets to `context.env`, over the dev server's environment variables of the same name. A plugin then reads `context.env.DB` as it would in production. To use a Wrangler environment's bindings, set `CLOUDFLARE_ENV` to its name, as you would for `wrangler dev`. A host app that picks an environment in its adapter options sets `CLOUDFLARE_ENV` too, so its routes and its plugins read the same bindings.

Local data lives in `.wrangler/state` beside the Wrangler config and survives restarts. Inspect or seed it from the same directory:

```sh
npx wrangler d1 execute DB --local --command "SELECT * FROM entries"
```

The app needs `wrangler` installed; the standalone shell has it. Without a Wrangler config, `context.env` holds only the dev server's environment variables.

## Routing

- A request reaches plugin `<id>` only when its path starts with `<base><mountPath>/_svartz/<id>/`, where `<base>` is the deployment base (`target.basePath` or SvelteKit's `paths.base`). The id must match a whole path segment.
- Every other path renders as usual and never reaches a plugin.
- An unknown id, or a handler that returns `undefined`, answers 404 with `{ "error": "not_found", "message": "…" }`.
- Svartz URLs end in a slash, and the handler always sees one. A request without one, such as `/_svartz/hello/ping`, is redirected with a 308 to `/_svartz/hello/ping/`; clients resend the method and body, and the query is kept. When a SvelteKit route in the app matches the path, SvelteKit applies that route's `trailingSlash` first, so a host app's default `'never'` serves `/_svartz/hello/ping` without a redirect and hands the handler `/_svartz/hello/ping/`.
- While prerendering, plugin paths answer 404 without running the plugin, so build-time env never reaches a handler. Notes may link to plugin URLs: the crawler skips them instead of failing the build, and writes no static page for them.

A plugin id that serves requests may hold only lowercase letters, digits and hyphens.

## Targets

A vault with an active server plugin needs a server target:

| `target.type` | Adapter | Output |
| --- | --- | --- |
| `cloudflare-workers` | `@sveltejs/adapter-cloudflare` | `.svartz/vaults/<id>/.svelte-kit/cloudflare/` |
| `cloudflare-pages` | `@sveltejs/adapter-cloudflare` | `.svartz/vaults/<id>/.svelte-kit/cloudflare/` |
| `node` | `@sveltejs/adapter-node` | `<outDir>/index.js`; run it with `node` |

Notes, lists and theme pages are still prerendered and served as static files. A `static` vault with a server plugin fails the build, naming the vault and the plugin. A plugin that is `disabled`, or replaced by a same-id plugin without `server`, doesn't count.

A `host` vault uses the host app's adapter, which must not be `@sveltejs/adapter-static`, and the app adds `svartzHandle` to its hooks. See [server plugins in a host app](host-vaults.md#server-plugins).

`svartzHandle`, from the server-only module `virtual:svartz/server`, is the SvelteKit `handle` that routes plugin requests. The standalone shell's `src/hooks.server.ts` runs it before its own handle. Each vault's version is built with `createServerHandle` from `@svartz/core`; a host app's runs every host vault's in turn.

## Signed-in readers

To know who sent a request, add `@svartz/auth` to the vault and call `readIdentity(request, context.env)` from `@svartz/auth/server`. See [Reader sign-in](auth.md).

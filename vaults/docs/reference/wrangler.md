---
title: "Wrangler reference"
description: "Set Worker names, routes, assets, environments, and bindings per vault."
---

A `cloudflare-workers` target is that vault's Wrangler config. Apart from `type` and the build-owned fields below, settings pass through into `.svartz/vaults/<id>/wrangler.json` in the default layout. Svartz types common keys and Wrangler validates the result, including newer keys Svartz doesn't type yet.

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      site: { url: "https://notes.example.com" },
      target: {
        type: "cloudflare-workers",
        name: "garden-notes",
        workers_dev: false,
        routes: [{ pattern: "notes.example.com", custom_domain: true }],
        vars: { SITE_LABEL: "Garden notes" },
        d1_databases: [{ binding: "SVARTZ_DB", database_name: "garden-notes", database_id: "<id>" }],
      },
    },
  ],
});
```

## Routes and environments

`route` takes one route, `routes` takes a list. A route is a pattern string or an object with `pattern` and `custom_domain`, `zone_id`, or `zone_name`. Zone routes can also set `custom_domain`. A custom domain is a hostname without `https://` or a path; use a zone route such as `notes.example.com/*` to attach to an existing hostname and pattern. Choose one of `route` or `routes`. `site.url` sets canonical URLs; it does not create a route.

`env` maps environment names to Wrangler settings. Use `--env <name>` when deploying that environment. Wrangler controls which settings inherit, so repeat non-inherited bindings and variables inside the environment. Relative Wrangler paths resolve from the generated config, not the repository root. See [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) for each field's full shape and Cloudflare constraints.

## Build-owned settings and defaults

| Key | What Svartz writes |
| --- | --- |
| `name` | Vault ID unless overridden. |
| `compatibility_date` | `"2026-03-03"` unless overridden. |
| `compatibility_flags` | `["nodejs_compat", "nodejs_als"]` unless overridden. A supplied list replaces both. |
| `observability` | `{ enabled: true }` unless overridden. |
| `main` | `.svelte-kit/cloudflare/_worker.js`. Do not set this, even under `env`. |
| `assets.directory` | `.svelte-kit/cloudflare`. |
| `assets.binding`, `assets.run_worker_first` | `"ASSETS"` and `true`, for Markdown negotiation. |

You can set `assets.html_handling` (`auto-trailing-slash`, `force-trailing-slash`, `drop-trailing-slash`, or `none`) and `assets.not_found_handling` (`single-page-application`, `404-page`, or `none`). When an environment overrides `assets`, Svartz also sets its build-owned asset keys there.

## Accepted fields

| Area | Keys |
| --- | --- |
| Identity and routes | `name`, `account_id`, `main` (generated), `compatibility_date`, `compatibility_flags`, `route`, `routes`, `workers_dev`, `preview_urls` |
| Build and bundle | `tsconfig`, `rules`, `build` (`command`, `cwd`, `watch_dir`), `no_bundle`, `find_additional_modules`, `base_dir`, `preserve_file_names`, `minify`, `keep_names`, `define`, `assets` |
| Runtime | `triggers.crons`, `limits` (`cpu_ms`, `subrequests`), `observability` (`enabled`, `head_sampling_rate`), `logpush`, `placement` (`hint`, `host`, `hostname`, `mode`, `region`) |
| Variables and bindings | `vars`, `durable_objects`, `kv_namespaces`, `r2_buckets`, `vectorize`, `services`, `queues`, `workflows`, `tail_consumers`, `d1_databases`, `hyperdrive`, `analytics_engine_datasets`, `send_email`, `ai`, `browser`, `version_metadata` |
| Top level only | `keep_vars`, `migrations`, `send_metrics`, `env` |

## Deploy and set secrets

```sh
npx svartz build --vault notes
npx wrangler deploy --config .svartz/vaults/notes/wrangler.json
npx wrangler secret put PRIVATE_EXAMPLE_TOKEN --config .svartz/vaults/notes/wrangler.json
```

Use the same generated config and `--env` for a named environment. Do not commit secrets to `vars`. For `svartz dev`, put `.dev.vars` next to `svartz.config.ts`; set `CLOUDFLARE_ENV` for a named environment. Add bindings to the target for Workers, or the project's Wrangler file for Pages and Cloudflare hosts. See [[plugins/server-plugins|Server plugins]] for local bindings and [[start/deploying|Deploy a vault]] for Pages.

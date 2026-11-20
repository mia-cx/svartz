---
"svartz": minor
"@svartz/vite": minor
"@svartz/core": minor
---

Svartz builds a full site in any repository from just `svartz.config.ts` and its vaults: the `svartz` package now ships the app every vault builds with, unless its target is `host`. A host app's config can mix both: `svartz build` builds the host vaults in the app, then each other vault on its own, and `--vault <id>` builds a standalone vault there too.

Each `cloudflare-workers` vault is its own Worker. Its target is the Worker's Wrangler config, written to `.svartz/vaults/<id>/wrangler.json`: `name` defaults to the vault's id, and `routes`, `vars`, `d1_databases` and the other bindings come from the target. Two vaults in one config deploy to their own domains, each with its own theme, with `npx wrangler deploy --config .svartz/vaults/<id>/wrangler.json`. Under `svartz dev`, plugins read the target's bindings and the project's `.dev.vars` and `.env`.

`npx svartz init` in an empty directory now writes only `svartz.config.ts` with one `static` vault, a starter note, `.gitignore` and `package.json`. `svartz({ projectRoot })` in `@svartz/vite` now also resolves themes and Wrangler, and `wranglerDir` names the Wrangler config the dev server reads bindings from.

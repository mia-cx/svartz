# svartz

## 2.6.0

### Minor Changes

- ba0f490: Svartz builds a full site in any repository from just `svartz.config.ts` and its vaults: the `svartz` package now ships the app every vault builds with, unless its target is `host`. A host app's config can mix both: `svartz build` builds the host vaults in the app, then each other vault on its own, and `--vault <id>` builds a standalone vault there too.

  Each `cloudflare-workers` vault is its own Worker. Its target is the Worker's Wrangler config, written to `.svartz/vaults/<id>/wrangler.json`: `name` defaults to the vault's id, and `routes`, `vars`, `d1_databases` and the other bindings come from the target. Two vaults in one config deploy to their own domains, each with its own theme, with `npx wrangler deploy --config .svartz/vaults/<id>/wrangler.json`. Under `svartz dev`, plugins read the target's bindings and the project's `.dev.vars` and `.env`.

  The shipped app runs SvelteKit 3, so `svartz` now needs Node `^22.17.0 || >=24.0.0` and Vite `^8.0.12`, host apps included.

  `npx svartz init` in an empty directory now writes only `svartz.config.ts` with one `static` vault, a starter note, `.gitignore` and `package.json`. `svartz({ projectRoot })` in `@svartz/vite` now also resolves themes and Wrangler, and `wranglerDir` names the Wrangler config the dev server reads bindings from.

### Patch Changes

- 5596543: A wikilink or embed with an alias inside a table cell now resolves. Obsidian writes the alias separator there as `\|`, as in `[[Setup\|Install the sensor]]`, and Svartz used to keep the backslash in the link's target and show the link unresolved.

  The managed Turbo build task for a `cloudflare-workers` vault now caches the Worker's bundle and `wrangler.json`, which `wrangler deploy` reads, instead of `dist/`. Before, a cache hit restored no deployable Worker.

- 7b6fc6e: In a workspace whose `turbo.json` has a generic `build` task, the managed Turbo task that builds a vault (`svartz:build:<id>`) now depends on `^build`. The project's workspace packages build first, and their output counts toward the task's cache key, so rebuilding a local theme or plugin no longer brings back a stale cached vault build. Other workspaces keep independent vault builds: `^build` would fail on a dependency without a build, and naming package builds such as `theme#build` could pull in unrelated ones or close a cycle.
- Updated dependencies [a4084cd]
- Updated dependencies [ba0f490]
- Updated dependencies [67eb970]
  - @svartz/vite@2.6.0
  - @svartz/ui@2.6.0
  - @svartz/config@2.6.0

## 2.5.0

### Minor Changes

- 03747e2: Server plugins can render pages inside the theme's shell. A plugin claims page names with `server: { module, pages: ["greet"] }`, and its factory returns `{ handle, page }`: `page` answers each request under `<mount>/-/greet/` with a title and HTML, which the theme's default layout renders as its body, beside the explorer and under the header and search. Plugin pages render on every request and are never cached or prerendered; notes stay prerendered, and `/_svartz/<id>/` stays raw HTTP. A static vault with a plugin page fails the build, naming the vault and the plugin.

  The standalone shell renders plugin pages through a new `src/routes/[...mount=svartzMount]/-/[...page=svartzPage]/` route. Its param matchers, `isPluginPageMount` and `isPluginPageName` from `virtual:svartz/host`, send it only the page names claimed by the plugins of the vault at that mount, so a note in a folder named `-` stays a prerendered note, also under a name only another vault claims. A vault that publishes a note under a claimed name fails the build, naming the note. `npx svartz init` adds the route and its matchers (`src/params.ts` on SvelteKit 3, `src/params/` on SvelteKit 2) to host apps with a server adapter. A host app's build fails when a vault claims pages and no route renders them; run `npx svartz init`, or copy the route from the host vaults guide. The route renders `SvartzPluginPage` from `@svartz/ui/runtime` with what `svartzPage` from `virtual:svartz/server` answers.

### Patch Changes

- a1a928c: A standalone `cloudflare-workers` build now produces a worker that Wrangler can bundle and deploy. Before, the worker imported its server by a path that held only from `apps/web/.svelte-kit`, the symlink the CLI puts in place during a build, so bundling `.svartz/vaults/<id>/.svelte-kit/cloudflare/_worker.js` failed with `Could not resolve`. The build now copies `apps/web/wrangler.jsonc` to `.svartz/vaults/<id>/wrangler.jsonc` and builds against that copy, so the worker resolves its imports from where it lands. Deploy with `npx wrangler deploy` from `.svartz/vaults/<id>`.

  The deployed worker also serves Svartz's own static files, such as each page's `.md` copy and attachments. Workers run the worker ahead of every asset, and SvelteKit's worker served only SvelteKit's files, so a request negotiated to Markdown was redirected to a copy that answered 404.

- Updated dependencies [a1a928c]
- Updated dependencies [e44be06]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
  - @svartz/vite@2.5.0
  - @svartz/config@2.5.0

## 2.4.0

### Minor Changes

- d01cd5e: Server plugins reach their Cloudflare bindings under `svartz dev`. A vault on `cloudflare-workers`, `cloudflare-pages`, or a host app on `@sveltejs/adapter-cloudflare` gets the D1 databases, other bindings, `vars` and `.dev.vars` secrets of the `wrangler.jsonc` (or `.json`, `.toml`) beside `svartz.config.ts` in `context.env`. Local data persists in `.wrangler/state` beside that config, where `wrangler d1 execute --local` reads it. See "Bindings under `svartz dev`" in `docs/server-plugins.md`.
- e46840b: Host SvelteKit apps can run server plugins. Add `svartzHandle` from `virtual:svartz/server` to the app's `hooks.server`, and it routes `<mount>/_svartz/<plugin-id>/` to every host vault's server plugins. A host build with an active server plugin fails when the hooks don't run `svartzHandle`, printing the lines to add, and fails on `@sveltejs/adapter-static`, naming the vault and plugin. See "Server plugins" in `docs/host-vaults.md`.
- f6c4530: `svartz init` scaffolds a SvelteKit 3 project: Vite 8, `@sveltejs/vite-plugin-svelte` 7, `@sveltejs/adapter-static` 4 and TypeScript 6, with the SvelteKit config passed to `sveltekit()` in `vite.config.ts` instead of `svelte.config.js`. A new project needs Node `^22.17.0 || >=24.0.0`: its `package.json` says so, and `svartz init` stops on an older Node before writing anything. Existing SvelteKit 2 apps keep working as hosts. The Cloudflare Pages target builds with `@sveltejs/adapter-cloudflare` directly.
- 40f109e: Build SvelteKit 3 hosts. `svartz build` runs Vite's app builder, so SvelteKit 3 builds its server, prerenders, and runs the adapter; SvelteKit 2 hosts build as before. A host that only lists notes or links their Markdown imports `virtual:svartz/index`: each vault's published index and site metadata, without Svartz's page runtime.
- 6681829: Render Svartz pages in SvelteKit 3 hosts. `virtual:svartz/host` exports SvelteKit's `base` and `assets`, which SvelteKit 3's `$app/paths` dropped; the generated catchall and `noteStylesheets` read them there, so they build on SvelteKit 2 and 3. Run `svartz init` to upgrade an existing generated catchall. A SvelteKit 3 host that sets `adapter-cloudflare` in `sveltekit({ adapter })` now gets its Wrangler bindings under `svartz dev`. `@svartz/vite` adds `svelteKitPaths`, which reads SvelteKit's `assets` as well as its `base`.

### Patch Changes

- 020d144: Send requests for a page URL that prefer text/markdown, and known AI agents, to the page's emitted Markdown copy with a 303 redirect, so the copy's relative links resolve. Standalone Node and Cloudflare adapters negotiate ahead of static serving through the shared Svartz router, including percent-encoded and slashless page URLs, while static builds retain their Markdown copies and alternate links.
- 49ffe2a: Keep note stylesheets through catchall route hydration and migrate generated host routes to serialized server stylesheet data.
- 599a2ae: `svartz dev` no longer watches `node_modules`, `.git`, `.svelte-kit`, `.turbo` or `.wrangler` inside a watched theme. On macOS a theme outside the project held about 40,000 open files through its dependencies, so a second dev server could fail with `ENFILE: file table overflow`.
- f55f8fa: Prerender and serve notes with non-ASCII names in standalone builds and generated host routes. Share guarded URL-path decoding with Markdown negotiation and return 404 for malformed escapes.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [6172acb]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
- Updated dependencies [274ba31]
- Updated dependencies [40f109e]
- Updated dependencies [6681829]
  - @svartz/vite@2.4.0
  - @svartz/config@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [cd87265]
- Updated dependencies [bdc5800]
  - @svartz/vite@2.3.0
  - @svartz/config@2.3.0

## 2.2.0

### Patch Changes

- @svartz/vite@2.2.0
  - @svartz/config@2.2.0

## 2.1.3

### Patch Changes

- @svartz/vite@2.1.3
  - @svartz/config@2.1.3

## 2.1.2

### Patch Changes

- @svartz/vite@2.1.2
  - @svartz/config@2.1.2

## 2.1.1

### Patch Changes

- @svartz/vite@2.1.1
  - @svartz/config@2.1.1

## 2.1.0

### Patch Changes

- @svartz/config@2.1.0
  - @svartz/vite@2.1.0

## 2.0.0

### Minor Changes

- 26588ee: `theme.base` accepts a list of themes to compose in one site: `theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'] }`. Svartz composes every listed theme's `extensions` with theme-minimal's `composeThemes`; the first listed theme styles the site, and the other `theme` keys apply to all of them. Each relative entry resolves from the config directory. A listed theme that exports no `extensions` fails the build.

  In `@svartz/vite`, `resolveThemeModuleIds` replaces `resolveThemeModuleId`, and `resolveThemeRuntimeImport` replaces `resolveThemeRuntimeImportId`; it returns a `ThemeImport`, the theme modules and composer for a list. `loadThemeModule` takes a map of workspace theme sources, and the CLI passes them in `SVARTZ_THEME_SOURCES` instead of `SVARTZ_THEME_SOURCE_ID` and `SVARTZ_THEME_SOURCE_PATH`.

### Patch Changes

- Updated dependencies [b853e4f]
- Updated dependencies [26588ee]
  - @svartz/config@2.0.0
  - @svartz/vite@2.0.0

## 1.2.1

### Patch Changes

- @svartz/vite@1.2.1
  - @svartz/config@1.2.1

## 1.2.0

### Patch Changes

- @svartz/vite@1.2.0
  - @svartz/config@1.2.0

## 1.1.1

### Patch Changes

- @svartz/config@1.1.1
  - @svartz/vite@1.1.1

## 1.1.0

### Patch Changes

- 67b759b: Attachments, feeds, and other generated files now reach SvelteKit's client output before prerendering, so a page that links one no longer fails the build with a 404.
- Updated dependencies [67b759b]
- Updated dependencies [67b759b]
  - @svartz/config@1.1.0
  - @svartz/vite@1.1.0

## 1.0.1

### Patch Changes

- b27060e: The CLI now ships `@tailwindcss/forms` and `@tailwindcss/typography` for the host Tailwind entry, so a host installs only `tailwindcss` 4, including under pnpm. `svartz init` no longer adds the two plugins.
- @svartz/vite@1.0.1
  - @svartz/config@1.0.1

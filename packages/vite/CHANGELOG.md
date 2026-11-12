# @svartz/vite

## 2.4.0

### Minor Changes

- 7a1d5f9: Browser scripts can show HTML as the page shows notes. `context.mountContent(element)` returns a view whose `render(html)` draws the HTML through the page's content components (the host's overrides, then the theme's callout, code block, image, link and embed), sanitized as the build sanitizes, keeping the blocks a render didn't change. `@svartz/plugins/preview` renders a note's Markdown to that HTML in the browser, with GitHub Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published notes; it imports no Node built-ins, so it also runs in a web worker. `@svartz/plugins/content` exports the content-slot classification the build and the browser renderer share.
- d7303ae: Browser scripts get the note body they serve on a host page. When a host page renders a note with `SvartzNoteContent`, each mount's `context.note` is that note's body, so plugins work on it instead of the document's first `[data-svartz-note]`, and a page with several notes keeps each one's plugin features apart. Theme pages leave it unset.
- d01cd5e: Server plugins reach their Cloudflare bindings under `svartz dev`. A vault on `cloudflare-workers`, `cloudflare-pages`, or a host app on `@sveltejs/adapter-cloudflare` gets the D1 databases, other bindings, `vars` and `.dev.vars` secrets of the `wrangler.jsonc` (or `.json`, `.toml`) beside `svartz.config.ts` in `context.env`. Local data persists in `.wrangler/state` beside that config, where `wrangler d1 execute --local` reads it. See "Bindings under `svartz dev`" in `docs/server-plugins.md`.
- e46840b: Host SvelteKit apps can run server plugins. Add `svartzHandle` from `virtual:svartz/server` to the app's `hooks.server`, and it routes `<mount>/_svartz/<plugin-id>/` to every host vault's server plugins. A host build with an active server plugin fails when the hooks don't run `svartzHandle`, printing the lines to add, and fails on `@sveltejs/adapter-static`, naming the vault and plugin. See "Server plugins" in `docs/host-vaults.md`.
- 14bc204: A plugin's hooks can hand its server module JSON that only the build knows, such as the notes it published: set it with `getCompilerContributions(ctx).serverData.set(id, data)` and the server factory receives it as its second argument, in the server bundle only. Browser scripts' `mount(pathname, options, context)` now gets `context.base`, the deployment base path, so a script can call its plugin's server at `<base><mount>/_svartz/<id>/`. See `docs/server-plugins.md`.
- 639e96d: A plugin can answer requests at runtime: give it `server: { module, options }` and a standalone vault on `cloudflare-workers`, `cloudflare-pages` or `node` routes `/_svartz/<plugin-id>/` to its handler while pages stay prerendered. A `static` vault with such a plugin fails the build, naming the vault and plugin. Secrets in options are named with `{ env: "NAME" }`. See `docs/server-plugins.md`.
- 40f109e: Build SvelteKit 3 hosts. `svartz build` runs Vite's app builder, so SvelteKit 3 builds its server, prerenders, and runs the adapter; SvelteKit 2 hosts build as before. A host that only lists notes or links their Markdown imports `virtual:svartz/index`: each vault's published index and site metadata, without Svartz's page runtime.
- 6681829: Render Svartz pages in SvelteKit 3 hosts. `virtual:svartz/host` exports SvelteKit's `base` and `assets`, which SvelteKit 3's `$app/paths` dropped; the generated catchall and `noteStylesheets` read them there, so they build on SvelteKit 2 and 3. Run `svartz init` to upgrade an existing generated catchall. A SvelteKit 3 host that sets `adapter-cloudflare` in `sveltekit({ adapter })` now gets its Wrangler bindings under `svartz dev`. `@svartz/vite` adds `svelteKitPaths`, which reads SvelteKit's `assets` as well as its `base`.

### Patch Changes

- 020d144: Send requests for a page URL that prefer text/markdown, and known AI agents, to the page's emitted Markdown copy with a 303 redirect, so the copy's relative links resolve. Standalone Node and Cloudflare adapters negotiate ahead of static serving through the shared Svartz router, including percent-encoded and slashless page URLs, while static builds retain their Markdown copies and alternate links.
- f55f8fa: Prerender and serve notes with non-ASCII names in standalone builds and generated host routes. Share guarded URL-path decoding with Markdown negotiation and return 404 for malformed escapes.
- 274ba31: Take the deployment base from Svartz's generated `deploymentBasePath` instead of `$app/paths`, whose `base` SvelteKit 3 removed. Site logos and protected note payloads now use the absolute base during server rendering too, as vault links already did. A `SiteLogo` outside a Svartz page, such as in a host's own header, takes the base as a prop: `<SiteLogo {logo} base={vaults[0].basePath} />`.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [64ba28f]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [f55f8fa]
- Updated dependencies [9d8dbee]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
- Updated dependencies [6907ba3]
- Updated dependencies [8bdba67]
- Updated dependencies [9e3cabc]
- Updated dependencies [101770b]
- Updated dependencies [2624a50]
  - @svartz/core@2.4.0
  - @svartz/plugins@2.4.0
  - @svartz/theme-minimal@2.4.0

## 2.3.0

### Patch Changes

- cd87265: `svartz dev` rebuilds and reloads after a vault edit again. The vault watchers were released as soon as the dev server started.
- Updated dependencies [e199cef]
- Updated dependencies [0a0cfba]
- Updated dependencies [bdc5800]
  - @svartz/plugins@2.3.0
  - @svartz/core@2.3.0
  - @svartz/theme-minimal@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [39f24e9]
  - @svartz/theme-minimal@2.2.0
  - @svartz/core@2.2.0
  - @svartz/plugins@2.2.0

## 2.1.3

### Patch Changes

- Updated dependencies [4cd36f7]
  - @svartz/theme-minimal@2.1.3
  - @svartz/core@2.1.3
  - @svartz/plugins@2.1.3

## 2.1.2

### Patch Changes

- @svartz/theme-minimal@2.1.2
  - @svartz/core@2.1.2
  - @svartz/plugins@2.1.2

## 2.1.1

### Patch Changes

- @svartz/theme-minimal@2.1.1
  - @svartz/core@2.1.1
  - @svartz/plugins@2.1.1

## 2.1.0

### Patch Changes

- @svartz/core@2.1.0
  - @svartz/plugins@2.1.0
  - @svartz/theme-minimal@2.1.0

## 2.0.0

### Major Changes

- 26588ee: `theme.base` accepts a list of themes to compose in one site: `theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'] }`. Svartz composes every listed theme's `extensions` with theme-minimal's `composeThemes`; the first listed theme styles the site, and the other `theme` keys apply to all of them. Each relative entry resolves from the config directory. A listed theme that exports no `extensions` fails the build.

  In `@svartz/vite`, `resolveThemeModuleIds` replaces `resolveThemeModuleId`, and `resolveThemeRuntimeImport` replaces `resolveThemeRuntimeImportId`; it returns a `ThemeImport`, the theme modules and composer for a list. `loadThemeModule` takes a map of workspace theme sources, and the CLI passes them in `SVARTZ_THEME_SOURCES` instead of `SVARTZ_THEME_SOURCE_ID` and `SVARTZ_THEME_SOURCE_PATH`.

### Patch Changes

- Updated dependencies [26588ee]
- Updated dependencies [0c0fb62]
  - @svartz/core@2.0.0
  - @svartz/plugins@2.0.0
  - @svartz/theme-minimal@2.0.0

## 1.2.1

### Patch Changes

- @svartz/theme-minimal@1.2.1
  - @svartz/core@1.2.1
  - @svartz/plugins@1.2.1

## 1.2.0

### Patch Changes

- @svartz/theme-minimal@1.2.0
  - @svartz/core@1.2.0
  - @svartz/plugins@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1
  - @svartz/plugins@1.1.1
  - @svartz/theme-minimal@1.1.1

## 1.1.0

### Patch Changes

- 67b759b: Attachments, feeds, and other generated files now reach SvelteKit's client output before prerendering, so a page that links one no longer fails the build with a 404.
- Updated dependencies [67b759b]
- Updated dependencies [c2b31c8]
  - @svartz/plugins@1.1.0
  - @svartz/core@1.1.0
  - @svartz/theme-minimal@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [dd069ad]
- Updated dependencies [6dd3049]
  - @svartz/plugins@1.0.1
  - @svartz/theme-minimal@1.0.1
  - @svartz/core@1.0.1

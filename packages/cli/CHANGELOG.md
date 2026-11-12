# svartz

## 2.4.0

### Minor Changes

- d01cd5e: Server plugins reach their Cloudflare bindings under `svartz dev`. A vault on `cloudflare-workers`, `cloudflare-pages`, or a host app on `@sveltejs/adapter-cloudflare` gets the D1 databases, other bindings, `vars` and `.dev.vars` secrets of the `wrangler.jsonc` (or `.json`, `.toml`) beside `svartz.config.ts` in `context.env`. Local data persists in `.wrangler/state` beside that config, where `wrangler d1 execute --local` reads it. See "Bindings under `svartz dev`" in `docs/server-plugins.md`.
- e46840b: Host SvelteKit apps can run server plugins. Add `svartzHandle` from `virtual:svartz/server` to the app's `hooks.server`, and it routes `<mount>/_svartz/<plugin-id>/` to every host vault's server plugins. A host build with an active server plugin fails when the hooks don't run `svartzHandle`, printing the lines to add, and fails on `@sveltejs/adapter-static`, naming the vault and plugin. See "Server plugins" in `docs/host-vaults.md`.
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

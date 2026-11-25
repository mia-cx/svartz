# @svartz/core

## 2.6.0

### Minor Changes

- ba0f490: Svartz builds a full site in any repository from just `svartz.config.ts` and its vaults: the `svartz` package now ships the app every vault builds with, unless its target is `host`. A host app's config can mix both: `svartz build` builds the host vaults in the app, then each other vault on its own, and `--vault <id>` builds a standalone vault there too.

  Each `cloudflare-workers` vault is its own Worker. Its target is the Worker's Wrangler config, written to `.svartz/vaults/<id>/wrangler.json`: `name` defaults to the vault's id, and `routes`, `vars`, `d1_databases` and the other bindings come from the target. Two vaults in one config deploy to their own domains, each with its own theme, with `npx wrangler deploy --config .svartz/vaults/<id>/wrangler.json`. Under `svartz dev`, plugins read the target's bindings and the project's `.dev.vars` and `.env`.

  The shipped app runs SvelteKit 3, so `svartz` now needs Node `^22.17.0 || >=24.0.0` and Vite `^8.0.12`, host apps included.

  `npx svartz init` in an empty directory now writes only `svartz.config.ts` with one `static` vault, a starter note, `.gitignore` and `package.json`. `svartz({ projectRoot })` in `@svartz/vite` now also resolves themes and Wrangler, and `wranglerDir` names the Wrangler config the dev server reads bindings from.

## 2.5.0

### Minor Changes

- 34fe812: Accounts can form groups, such as a wiki's alliances. Any signed-in reader creates a group from the Groups section of `/-/account/` and owns it. Each group has a page at `<mount>/-/groups/<name>/`, shown only to its members, where owners invite accounts by handle, make members co-owners and remove members, and members leave. An invited account joins only by accepting on its account page. A group always keeps at least one owner.

  Grants can name a group in People & permissions, and every member holds them; a group's grants rank below an account's own and above its roles'. A moderator who holds the new `auth:group-links:write` permission links a group to a vault, folder or page from the dashboard's Groups panel, which gives the group's owners every content permission there and below. Linking has no default, so only admins hold it until granted, and every link, unlink and membership change is recorded in the audit log.

  A plugin can declare a permission with `administrative: true` when it administers the site rather than a page's content. Owning a user page or a group's linked pages never gives such a permission; only the `admin` role or a grant does. Auth's own permissions are administrative, and each grant, role and link change is checked on the object it lands on.

- 142f796: Server plugins can add panels to the site's dashboard. A server factory returns `dashboard: { title, panels }` beside `handle` and `page`, each panel with an `id`, a `title`, the `permission` that opens it and a `render` function that answers like a page renderer. The panel renders at `<mount>/-/dashboard/<plugin id>/<panel id>/` in the plugin's own context, so its forms post to the plugin's routes. Server code lists every panel on the vault with `context.dashboard()`. `@svartz/auth` serves the dashboard and decides who sees each panel.
- e44be06: A server plugin can start before everything else. With `server: { module, eager: true }`, its factory runs before the site answers its first request at runtime (a page, a plugin or one of the app's own routes), instead of on its own first request. Use it for a plugin whose factory sets up what other code reads. `@svartz/auth` is eager, so accounts are always read with the deployed `admins`.
- 5178445: A plugin can say what it was made from and what it reads. `options` on `SvartzPlugin` holds plain data, such as a factory's options merged over its defaults, and `reads` lists the files its hooks read while building, as paths from the vault's folder or absolute ones. Normalization keeps both. A plugin's hooks close over their options, where nothing outside can read them, and `options` can only name a file. So `@svartz/plugin-history`'s version cache reads `options` and the contents of every `reads` file, and compiles a post's versions again when either changes. A plugin whose output depends on values it closes over should put them in `options`, and the files it reads in `reads`.

  Every option-taking plugin in `@svartz/plugins` sets `options` to its effective options: `roamFlavoredMarkdown`, `oxHugoFlavoredMarkdown`, `presentation`, `citations`, `transformGfm`, `transformSyntax` and `transformLatex`. `citations` also lists its bibliographies in `reads`, and its style when that is a `.csl` file.

  `citations` now renders every note of a build that cites the bibliography. rehype-citation resolved the bibliography's path in place, so every note after the first looked for it below the vault twice over and failed.

- 03747e2: Server plugins can render pages inside the theme's shell. A plugin claims page names with `server: { module, pages: ["greet"] }`, and its factory returns `{ handle, page }`: `page` answers each request under `<mount>/-/greet/` with a title and HTML, which the theme's default layout renders as its body, beside the explorer and under the header and search. Plugin pages render on every request and are never cached or prerendered; notes stay prerendered, and `/_svartz/<id>/` stays raw HTTP. A static vault with a plugin page fails the build, naming the vault and the plugin.

  The standalone shell renders plugin pages through a new `src/routes/[...mount=svartzMount]/-/[...page=svartzPage]/` route. Its param matchers, `isPluginPageMount` and `isPluginPageName` from `virtual:svartz/host`, send it only the page names claimed by the plugins of the vault at that mount, so a note in a folder named `-` stays a prerendered note, also under a name only another vault claims. A vault that publishes a note under a claimed name fails the build, naming the note. `npx svartz init` adds the route and its matchers (`src/params.ts` on SvelteKit 3, `src/params/` on SvelteKit 2) to host apps with a server adapter. A host app's build fails when a vault claims pages and no route renders them; run `npx svartz init`, or copy the route from the host vaults guide. The route renders `SvartzPluginPage` from `@svartz/ui/runtime` with what `svartzPage` from `virtual:svartz/server` answers.

- a863185: Plugins can declare permissions and check them with one call. A plugin lists what it checks under `permissions`, as `namespace:feature:action` slugs with a name, a description and optional defaults for the built-in actors `guest` (everyone) and `signed-in` (everyone with an account). Auth collects the declarations at build time, a theme preset's plugins included, and fails the build on a malformed one. Build hooks can read every plugin the build runs as `ctx.plugins`.

  `can(account, permission, object, env)` from `@svartz/auth/server` answers whether an account, or a guest, holds a permission on the site, a vault or a page. Grants live in `SVARTZ_DB` and give an actor `allow`, `deny` or `unset` on an object: the most specific object with a grant that applies decides, then the most specific actor, and a deny beats an allow between equals. Admins are allowed everything, and every account everything on its own `users/<handle>` page. Without `SVARTZ_DB`, `can()` answers `false`.

  Annotations now declares `annotations:comments:write`, which every signed-in reader holds by default, and `annotations:comments:delete`, which lets a reader delete anyone's annotations on a page. On a site with accounts, each identity in the `moderators` option becomes a grant of `annotations:comments:delete` on the vault once its owner has an account, and the grant decides from then on. `moderators` is deprecated; grant the permission instead. Sites without `SVARTZ_DB` keep using the list.

## 2.4.0

### Minor Changes

- a4c869f: One sign-in covers every host vault in an app. Every vault's sign-in runs through `callbackVault` (default: the first host vault that enables auth), so each provider needs one callback URL, and the session reads as signed in on every vault. A `callbackVault` that names no vault, a vault without auth, or a vault missing one of the providers fails config loading, naming the vault. Plugins can now read sibling vaults through a `forVault({ vault, vaults })` hook that runs at config resolution. See "Several vaults" in `docs/auth.md`.
- 7a1d5f9: Browser scripts can show HTML as the page shows notes. `context.mountContent(element)` returns a view whose `render(html)` draws the HTML through the page's content components (the host's overrides, then the theme's callout, code block, image, link and embed), sanitized as the build sanitizes, keeping the blocks a render didn't change. `@svartz/plugins/preview` renders a note's Markdown to that HTML in the browser, with GitHub Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published notes; it imports no Node built-ins, so it also runs in a web worker. `@svartz/plugins/content` exports the content-slot classification the build and the browser renderer share.
- d7303ae: Browser scripts get the note body they serve on a host page. When a host page renders a note with `SvartzNoteContent`, each mount's `context.note` is that note's body, so plugins work on it instead of the document's first `[data-svartz-note]`, and a page with several notes keeps each one's plugin features apart. Theme pages leave it unset.
- d01cd5e: Server plugins reach their Cloudflare bindings under `svartz dev`. A vault on `cloudflare-workers`, `cloudflare-pages`, or a host app on `@sveltejs/adapter-cloudflare` gets the D1 databases, other bindings, `vars` and `.dev.vars` secrets of the `wrangler.jsonc` (or `.json`, `.toml`) beside `svartz.config.ts` in `context.env`. Local data persists in `.wrangler/state` beside that config, where `wrangler d1 execute --local` reads it. See "Bindings under `svartz dev`" in `docs/server-plugins.md`.
- e46840b: Host SvelteKit apps can run server plugins. Add `svartzHandle` from `virtual:svartz/server` to the app's `hooks.server`, and it routes `<mount>/_svartz/<plugin-id>/` to every host vault's server plugins. A host build with an active server plugin fails when the hooks don't run `svartzHandle`, printing the lines to add, and fails on `@sveltejs/adapter-static`, naming the vault and plugin. See "Server plugins" in `docs/host-vaults.md`.
- 14bc204: A plugin's hooks can hand its server module JSON that only the build knows, such as the notes it published: set it with `getCompilerContributions(ctx).serverData.set(id, data)` and the server factory receives it as its second argument, in the server bundle only. Browser scripts' `mount(pathname, options, context)` now gets `context.base`, the deployment base path, so a script can call its plugin's server at `<base><mount>/_svartz/<id>/`. See `docs/server-plugins.md`.
- 639e96d: A plugin can answer requests at runtime: give it `server: { module, options }` and a standalone vault on `cloudflare-workers`, `cloudflare-pages` or `node` routes `/_svartz/<plugin-id>/` to its handler while pages stay prerendered. A `static` vault with such a plugin fails the build, naming the vault and plugin. Secrets in options are named with `{ env: "NAME" }`. See `docs/server-plugins.md`.

### Patch Changes

- 020d144: Send requests for a page URL that prefer text/markdown, and known AI agents, to the page's emitted Markdown copy with a 303 redirect, so the copy's relative links resolve. Standalone Node and Cloudflare adapters negotiate ahead of static serving through the shared Svartz router, including percent-encoded and slashless page URLs, while static builds retain their Markdown copies and alternate links.
- 6172acb: Server plugins work under SvelteKit 3. They read the process env on Node, and the Worker's `env` and `waitUntil` from `cloudflare:workers` on Cloudflare, since SvelteKit 3's `$env/dynamic/private` holds only declared variables and its `platform` carries no `env` or `ctx`; under `svartz dev` they also read the app's `.env`. Browser code that imports `virtual:svartz/server` fails the build, so plugin modules and options never reach client chunks. Markdown negotiation runs ahead of adapter-node 6's static files, and `sequence(svartzHandle, …)` no longer fails with "Could not get the request store" under adapter-cloudflare in dev. Svartz tells SvelteKit 2 from 3 by the version the app installs, and reads the adapter from `sveltekit({ adapter })` or `svelte.config.js`'s `kit.adapter` under either.
- f55f8fa: Prerender and serve notes with non-ASCII names in standalone builds and generated host routes. Share guarded URL-path decoding with Markdown negotiation and return 404 for malformed escapes.

## 2.3.0

### Minor Changes

- bdc5800: `index: { markdown: true }` puts each note's body in its index entry as Markdown with links resolved, for hosts that render notes with their own renderer.

## 2.2.0

No changes in this release.

## 2.1.3

No changes in this release.

## 2.1.2

No changes in this release.

## 2.1.1

No changes in this release.

## 2.1.0

No changes in this release.

## 2.0.0

### Minor Changes

- 26588ee: `theme.base` accepts a list of themes to compose in one site: `theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'] }`. Svartz composes every listed theme's `extensions` with theme-minimal's `composeThemes`; the first listed theme styles the site, and the other `theme` keys apply to all of them. Each relative entry resolves from the config directory. A listed theme that exports no `extensions` fails the build.

  In `@svartz/vite`, `resolveThemeModuleIds` replaces `resolveThemeModuleId`, and `resolveThemeRuntimeImport` replaces `resolveThemeRuntimeImportId`; it returns a `ThemeImport`, the theme modules and composer for a list. `loadThemeModule` takes a map of workspace theme sources, and the CLI passes them in `SVARTZ_THEME_SOURCES` instead of `SVARTZ_THEME_SOURCE_ID` and `SVARTZ_THEME_SOURCE_PATH`.

## 1.2.1

No changes in this release.

## 1.2.0

No changes in this release.

## 1.1.1

No changes in this release.

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.

## 1.0.1

No changes in this release.

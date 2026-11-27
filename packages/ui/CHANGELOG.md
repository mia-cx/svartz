# @svartz/ui

## 2.7.0

### Minor Changes

- a766950: The API and MCP docs themes document several API versions in one site. List them in `theme.versions`, such as `[{ id: "2026-04", status: "latest" }, { id: "2026-01", ref: "api/2026-01" }, { id: "2025-07", ref: "api/2025-07", status: "deprecated" }]`, and the `version` badge becomes a picker. The latest version is the vault as it stands, at its usual URLs. Every other version is the vault's folder at its git `ref`, published below its id, `/2026-01/pets/get-pet/`, and read from git without touching the checkout. The latest version's own id redirects to its pages, `/2026-04/pets/get-pet/` to `/pets/get-pet/`, so a link to a version keeps meaning that version after the next one ships. Those redirects are temporary (307) wherever a target emits one, such as Cloudflare Pages' `_redirects`, while note aliases stay permanent (308); `virtual:svartz/host` lists them apart as `routes.temporaryRedirects`, and `svartz init` adds them to a host app's generated catchall. A versioned vault's managed Turbo build is never cached, since a ref can move while its inputs stay the same.

  The picker keeps the reader on the page they're reading, or opens the version's home page when it lacks the page. A deprecated version's pages link the same page in the latest version. Search covers the version being read, and the sitemap and feed list the latest version only. Each older version's build is cached in `.svartz/vaults/<id>/versions/` and reused until its ref moves or Svartz, the config, a file a plugin reads or the lockfile changes. A vault with password groups builds every version each time, so a changed password applies to all of them.

  Several vaults in one standalone app now share one `virtual:svartz/server`, and a path is served by the vault with the deepest mount holding it. `@svartz/core` exports `describeValue`, the stable text the build caches key on.

- 5411016: Every page describes itself in JSON-LD when the vault sets `site.url`. Each page carries the site's `WebSite`, a note adds its `Article` (title, description, dates, URL, `site.author` and social image), and a page that shows breadcrumbs adds its `BreadcrumbList`. The docs theme publishes guides as `TechArticle` and symbol pages as `APIReference`; the API and MCP docs themes publish operations, tools and schemas as `APIReference`; the blog publishes posts as `BlogPosting`, described by the post's `excerpt` and by its own `author` when it names them. The blog and the wiki show no breadcrumbs, so they publish none. `<` is escaped in the script, so note text can't close it.

  A theme maps its own page kinds with `structuredData`: on a theme-minimal extension it maps the article of each note the theme renders, and learns which renderer claimed it. The new `chrome.breadcrumbs` flag hides minimal's breadcrumbs and their structured data together.

### Patch Changes

- a55dc75: The light-mode accent is a shade darker, `oklch(0.58 0.2 33)`, so the label on a primary button, such as Sign in, meets WCAG AA's 4.5:1 against the accent fill. Links derived from the accent darken with it.
- 323d965: API and MCP reference sites line up their columns. A guide's contents column is as wide as the explorer (16rem) and sits at the frame's right edge. Request and response examples fill the space beside the page up to that edge. The top bar uses the same columns, so search spans the page column. Below 75rem the project links move from the top bar to the top of the sidebar, which leaves search room to keep that width.
- 7e8955a: Every first-party theme with sidebars (minimal, docs, wiki, API and MCP docs) shares one frame: at most `--sv-frame-width` (92rem) wide, `--sv-side-width` (16rem) sidebars, and Quartz's breakpoints. At 75rem a right column moves under the page, and at 50rem the explorer becomes a drawer. Docs' contents column grows from 13rem to 16rem, wiki's sidebar from 14rem to 16rem, and API docs narrow from 100rem to 92rem.
- 768e229: The default favicon, the `.sv-mark` class and the corner of the default social image now show Svelte's logo, exactly as `sv create` ships it for a new app's favicon. It's a placeholder until Svartz has a mark of its own. A site with its own `site.favicon` is unaffected.
- Updated dependencies [a766950]
- Updated dependencies [0b7e0ca]
- Updated dependencies [38c347c]
- Updated dependencies [5411016]
  - @svartz/core@2.7.0
  - @svartz/plugins@2.7.0

## 2.6.0

### Patch Changes

- 67eb970: Symbol pages link `[[Name]]` in signatures, in member signatures and in type parameter defaults, as they already did in parameter types. A member takes a `default`, shown under its description, so an options interface lists each field's type, default and description:

  ```yaml
  members:
    - { name: mode, kind: property, signature: 'mode?: [[Mode]]', default: '`"light"`' }
  ```

  A class with a `constructor` member renders again; it used to fail the build.

  A frontmatter wikilink that names a note by its vault path now resolves when the file name has an underscore, as in `[[reference/api/core/CONTRACT_VERSION|CONTRACT_VERSION]]`.

- Updated dependencies [5596543]
- Updated dependencies [1ddaf7e]
- Updated dependencies [dbf8b88]
- Updated dependencies [8f0291d]
- Updated dependencies [04e44dd]
- Updated dependencies [ba0f490]
  - @svartz/plugins@2.6.0
  - @svartz/core@2.6.0

## 2.5.0

### Minor Changes

- 03747e2: Server plugins can render pages inside the theme's shell. A plugin claims page names with `server: { module, pages: ["greet"] }`, and its factory returns `{ handle, page }`: `page` answers each request under `<mount>/-/greet/` with a title and HTML, which the theme's default layout renders as its body, beside the explorer and under the header and search. Plugin pages render on every request and are never cached or prerendered; notes stay prerendered, and `/_svartz/<id>/` stays raw HTTP. A static vault with a plugin page fails the build, naming the vault and the plugin.

  The standalone shell renders plugin pages through a new `src/routes/[...mount=svartzMount]/-/[...page=svartzPage]/` route. Its param matchers, `isPluginPageMount` and `isPluginPageName` from `virtual:svartz/host`, send it only the page names claimed by the plugins of the vault at that mount, so a note in a folder named `-` stays a prerendered note, also under a name only another vault claims. A vault that publishes a note under a claimed name fails the build, naming the note. `npx svartz init` adds the route and its matchers (`src/params.ts` on SvelteKit 3, `src/params/` on SvelteKit 2) to host apps with a server adapter. A host app's build fails when a vault claims pages and no route renders them; run `npx svartz init`, or copy the route from the host vaults guide. The route renders `SvartzPluginPage` from `@svartz/ui/runtime` with what `svartzPage` from `virtual:svartz/server` answers.

### Patch Changes

- Updated dependencies [34fe812]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [35ef566]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
- Updated dependencies [0661dc3]
- Updated dependencies [3a2a761]
- Updated dependencies [72e30fc]
- Updated dependencies [b0548e3]
  - @svartz/core@2.5.0
  - @svartz/plugins@2.5.0

## 2.4.0

### Minor Changes

- 7a1d5f9: Browser scripts can show HTML as the page shows notes. `context.mountContent(element)` returns a view whose `render(html)` draws the HTML through the page's content components (the host's overrides, then the theme's callout, code block, image, link and embed), sanitized as the build sanitizes, keeping the blocks a render didn't change. `@svartz/plugins/preview` renders a note's Markdown to that HTML in the browser, with GitHub Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published notes; it imports no Node built-ins, so it also runs in a web worker. `@svartz/plugins/content` exports the content-slot classification the build and the browser renderer share.
- d7303ae: Browser scripts get the note body they serve on a host page. When a host page renders a note with `SvartzNoteContent`, each mount's `context.note` is that note's body, so plugins work on it instead of the document's first `[data-svartz-note]`, and a page with several notes keeps each one's plugin features apart. Theme pages leave it unset.
- dafcfc9: Host apps get annotations on their own pages. `SvartzNoteContent` marks a public note's body like theme-minimal does, so the vault's annotations show on it with no code. On markup the host renders itself, `attach(element, { vault, slug })` takes a vault from `virtual:svartz/host` and the note's slug, and finds the routes under the deployment base and mount itself. See "Annotations" in `docs/host-vaults.md`.
- 2624a50: Plugins can add actions to every page. Each note's page actions end with a page-actions region (`[data-svartz-region="page-actions"]`), and every page has a site-actions region (`[data-svartz-region="site-actions"]`) in the rail or site navigation, inside the phone drawer on narrow screens. A plugin's browser script mounts links or buttons there and removes them in its cleanup; empty regions take no space. The wiki shows page actions beside the article title and site actions under Random page. Theme authors place the new `SiteActions` component from `@svartz/ui`, and `PageActions` now renders on notes without a Markdown copy.

### Patch Changes

- f55f8fa: Prerender and serve notes with non-ASCII names in standalone builds and generated host routes. Share guarded URL-path decoding with Markdown negotiation and return 404 for malformed escapes.
- 274ba31: Take the deployment base from Svartz's generated `deploymentBasePath` instead of `$app/paths`, whose `base` SvelteKit 3 removed. Site logos and protected note payloads now use the absolute base during server rendering too, as vault links already did. A `SiteLogo` outside a Svartz page, such as in a host's own header, takes the base as a prop: `<SiteLogo {logo} base={vaults[0].basePath} />`.
- 6681829: Render Svartz pages in SvelteKit 3 hosts. `virtual:svartz/host` exports SvelteKit's `base` and `assets`, which SvelteKit 3's `$app/paths` dropped; the generated catchall and `noteStylesheets` read them there, so they build on SvelteKit 2 and 3. Run `svartz init` to upgrade an existing generated catchall. A SvelteKit 3 host that sets `adapter-cloudflare` in `sveltekit({ adapter })` now gets its Wrangler bindings under `svartz dev`. `@svartz/vite` adds `svelteKitPaths`, which reads SvelteKit's `assets` as well as its `base`.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [64ba28f]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [6172acb]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
- Updated dependencies [6907ba3]
- Updated dependencies [8bdba67]
- Updated dependencies [9e3cabc]
- Updated dependencies [101770b]
  - @svartz/core@2.4.0
  - @svartz/plugins@2.4.0

## 2.3.0

### Patch Changes

- 276d9a0: A host page that shows a note body with `SvartzNoteContent` keeps its own `html`, `body`, selection and focus styles. Theme pages keep Svartz's element defaults as before.
- Updated dependencies [e199cef]
- Updated dependencies [0a0cfba]
- Updated dependencies [bdc5800]
  - @svartz/plugins@2.3.0
  - @svartz/core@2.3.0

## 2.2.0

### Minor Changes

- 39f24e9: `theme.logo` shows a site's mark before its title in every theme's header. `src` is the mark; an optional `dark` replaces it in dark mode, following the reader's pinned colour mode or else the OS. Paths from the site root get the deployment base; URLs pass through. `SiteLogo` renders it for custom headers.

### Patch Changes

- 6e7aab6: `theme.logo` works in Safari 16 and Chrome before 120.
- @svartz/core@2.2.0
  - @svartz/plugins@2.2.0

## 2.1.3

### Patch Changes

- 4cd36f7: Two link labels that share a URL in `nav` or `footer.links` no longer crash the page. The blog footer shows a label in both lists once.

  Vite no longer fails its dependency scan on `ColorModeToggle`, so the first browser test run in a theme stops reloading mid-run.

- @svartz/core@2.1.3
  - @svartz/plugins@2.1.3

## 2.1.2

### Patch Changes

- cbad902: On phones, reference themes show the top bar's project links (`theme.nav`) at the top of the page drawer, since the top bar has no room for them there.
- @svartz/core@2.1.2
  - @svartz/plugins@2.1.2

## 2.1.1

### Patch Changes

- 3209fb1: Jumps to a heading on reference pages, from the contents list or a `#anchor` link, stop below the sticky top bar instead of under it.
- @svartz/core@2.1.1
  - @svartz/plugins@2.1.1

## 2.1.0

### Patch Changes

- @svartz/core@2.1.0
  - @svartz/plugins@2.1.0

## 2.0.0

### Major Changes

- 0c0fb62: Every default theme now extends theme-minimal, and themes compose. Minimal's layout is the one shell. A theme declares only what differs: a frame, any region (header, explorer, page head, right column, page foot, footer), page renderers that claim pages from their frontmatter, list pages, and chrome switches. Regions a theme doesn't swap stay minimal's, and swapped ones receive minimal's shell state: the explorer tree, the current folder path, contents, and previous and next.

  `composeThemes(extensions, config)` from `@svartz/theme-minimal` (build) and `@svartz/theme-minimal/runtime` combines themes in one site. The first theme styles the site. Each page renders with the theme its frontmatter picks: its own `theme:`, then the nearest folder note's, then whichever theme's renderer detects it (`operation`, `model`), then the first theme. A folder note's `theme:` also picks how that folder's page lists. Two themes claiming one page, or an unknown `theme:`, fails the build with the page's path.

  Docs, wiki, and blog keep their look as minimal extensions. Docs keeps its top bar, and symbol pages list in the explorer with kind badges. Wiki keeps its section bar, portal rail, infobox articles, and main page. Blog keeps its header, post feed, and archive. Every one now gets minimal's previous and next links and contents, unless its chrome turns them off.

  The API and MCP themes are minimal extensions with the reference frame: a top bar, minimal's explorer nested at any depth with method and TOOL badges and a filter, and examples in a wide right column. Guides get contents on the right, and every page gets previous and next links. Prerendered pages open the current page's folders and show previous and next without JavaScript. The explorer keeps folders closed when an open folder sits inside a closed one, and the phone drawer focuses its filter, closes on Escape, and makes the page behind it inert.

  Migration: `referenceTheme`, `ReferenceLayout`, `ReferenceNav`, the reference nav model, and the renderer registry are gone from `@svartz/ui/reference`. A site that combined API and MCP pages deletes its `theme/` folder and lists the themes in config:

  ```ts
  theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'], baseUrl: 'https://api.example.com' }
  ```

  Vaults that use one default theme only bump versions.

### Patch Changes

- Updated dependencies [26588ee]
  - @svartz/core@2.0.0
  - @svartz/plugins@2.0.0

## 1.2.1

### Patch Changes

- ce77637: The reference sidebar nests folders as a real tree: `Reference > Public API > Authentication` instead of peer groups titled `Public API / Authentication`. Each folder shows its own name, closing a folder hides everything under it, and the current page's folders open on arrival. Folders a reader opens or closes stay that way across pages, the filter opens the path to each match, and clearing it restores the reader's choices.

  `ReferenceNavSection` now holds `links` and nested `folders` (`ReferenceNavFolder`) instead of flat `groups`; `ReferenceNavGroup` is gone. `readingOrder` and `folderTrail` are new.

- @svartz/core@1.2.1
  - @svartz/plugins@1.2.1

## 1.2.0

### Minor Changes

- 1debbc9: Schema trees list every `oneOf`/`anyOf` alternative with its own fields and required marks, named by its `title` or discriminator value (`kind: webhook`), including inside arrays and nested objects. A `null` type or alternative makes a field nullable: `anyOf: [{ type: string, format: uri }, { type: 'null' }]` reads `string (uri) | null`, and `type: [string, number, null]` keeps both types.

  REST request examples no longer assume JSON. They read each success response for what it holds: nothing for a 204 or a response with `empty: true`, text for `contentType: text/markdown`, bytes for `image/png`, JSON otherwise, branching on the status when successes differ. A request body with `contentType: application/x-www-form-urlencoded` or `multipart/form-data` encodes as a form. Only `bearer`, `oauth2`, `openIdConnect`, and `basic` generate an `Authorization` header; other schemes send none. `operation.server` overrides the theme's `baseUrl` for one operation, and `order` frontmatter sorts reference sidebar sections, groups, and pages.

### Patch Changes

- @svartz/core@1.2.0
  - @svartz/plugins@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1
  - @svartz/plugins@1.1.1

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.
- c2b31c8: Notes and folders can set their place in the explorer and the wiki section bar with an `order` number in their frontmatter, lowest first. A folder takes its folder note's `order`; anything without one follows in title order.
- 6a78dcc: New `@svartz/theme-mcp-docs` documents MCP tools: input and output schemas, annotations, and `tools/call` examples that label tool errors and JSON-RPC errors apart. It and `@svartz/theme-api-docs` now share one reference shell from `@svartz/ui/reference`, so one site can combine REST, GraphQL, and MCP pages with `referenceTheme({ renderers: [...apiRenderers, ...mcpRenderers] })`. Each page's `operation.protocol` or `model` metadata picks its renderer, and metadata no renderer can read fails the build with the page's path. The sidebar gains a filter, nested folder groups, and fixed-width method badges beside each path. Operation pages show defaults, allowed values, limits, and "Defined in" source links.

### Patch Changes

- Updated dependencies [67b759b]
  - @svartz/plugins@1.1.0
  - @svartz/core@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [dd069ad]
- Updated dependencies [6dd3049]
  - @svartz/plugins@1.0.1
  - @svartz/core@1.0.1

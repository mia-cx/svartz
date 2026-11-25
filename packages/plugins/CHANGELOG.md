# @svartz/plugins

## 2.5.0

### Minor Changes

- 5178445: A plugin can say what it was made from and what it reads. `options` on `SvartzPlugin` holds plain data, such as a factory's options merged over its defaults, and `reads` lists the files its hooks read while building, as paths from the vault's folder or absolute ones. Normalization keeps both. A plugin's hooks close over their options, where nothing outside can read them, and `options` can only name a file. So `@svartz/plugin-history`'s version cache reads `options` and the contents of every `reads` file, and compiles a post's versions again when either changes. A plugin whose output depends on values it closes over should put them in `options`, and the files it reads in `reads`.

  Every option-taking plugin in `@svartz/plugins` sets `options` to its effective options: `roamFlavoredMarkdown`, `oxHugoFlavoredMarkdown`, `presentation`, `citations`, `transformGfm`, `transformSyntax` and `transformLatex`. `citations` also lists its bibliographies in `reads`, and its style when that is a `.csl` file.

  `citations` now renders every note of a build that cites the bibliography. rehype-citation resolved the bibliography's path in place, so every note after the first looked for it below the vault twice over and failed.

- 0661dc3: A second build in the same process, such as a `svartz dev` rebuild, no longer publishes a description or title the first build generated as if the note's author had written it. Parsing the same note text twice used to hand both builds one shared frontmatter object, so values a build wrote into it stayed for the next. Each parse now answers its own.

  `compileNoteVersion` also answers `resources`, the browser resources a version's steps registered, so a caller that keeps the compiled `markup` for a later build can give that build the scripts and styles the version needs.

- 3a2a761: Plugins can judge and build another version of a note, such as an earlier one from git, by the build's own rules.
  - `publishesNote(config, path, frontmatter)` answers whether the build publishes a note at `path` inside the vault with that frontmatter: discovery reads its folder, `include` and `exclude` let it through, and it isn't a draft or private, with a publication date overriding the patterns and the draft flag as before. A note it publishes may still be password-protected.
  - `keepsAttachment(config, path)` answers whether the build may publish the attachment at `path`: discovery reads its folder and `exclude` lets it through. The build publishes it once a published note references it.
  - `compileNoteVersion(ctx, note, version, options)`, called from `emitArtifacts`, compiles a version's Markdown as the build compiles the note itself: the vault's plugins run their frontmatter, link, OFM and embed stages on it among the published notes and attachments, then it compiles with the build's own Markdown steps, plus any its content alone needs, and the build's sanitizer, giving the Svelte markup a note page holds. It answers which of `options.attachments` the version references, links those `options.moved` names where it says, shows a relative link to anything `options.published` doesn't hold unresolved, and prefixes other relative URLs with `options.prefix` for a page below the note's own.

  `core:filter-unpublished` decides with `publishesNote` and `keepsAttachment`, so its behaviour is unchanged.

- 72e30fc: `@svartz/plugins/routes` exports `extractFrontmatter`, the parser the build reads frontmatter with, and `alternateRoutes(frontmatter, aliasesField)`, the routes a note's aliases ask to redirect from. A server can now work out every route a note's Markdown claims before it writes the note. `requestedSlug` accepts any object with a `path` and `frontmatter`.

### Patch Changes

- 35ef566: A folder note with no `title` is titled after its folder, as Obsidian shows it: `Guides/index.md` is "Guides", not "index". Its folder listing takes the same name.
- b0548e3: A note's raw HTML can no longer carry a script URL past the sanitizer by hiding its scheme behind a tab or newline (`java&#9;script:`), which browsers drop before reading it. `data:text/html` and `data:application/xhtml+xml` URLs are refused too, with or without a parameter after the type, and so is `vbscript:`.
- Updated dependencies [34fe812]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
  - @svartz/core@2.5.0

## 2.4.0

### Minor Changes

- 7a1d5f9: Browser scripts can show HTML as the page shows notes. `context.mountContent(element)` returns a view whose `render(html)` draws the HTML through the page's content components (the host's overrides, then the theme's callout, code block, image, link and embed), sanitized as the build sanitizes, keeping the blocks a render didn't change. `@svartz/plugins/preview` renders a note's Markdown to that HTML in the browser, with GitHub Flavored Markdown, Obsidian's comments, highlights, callouts and tags, and links resolved against the published notes; it imports no Node built-ins, so it also runs in a web worker. `@svartz/plugins/content` exports the content-slot classification the build and the browser renderer share.
- 6907ba3: `@svartz/plugins/routes` exports how `core:allocate-routes` derives a note's route: `pathRoute(path)`, `requestedSlug(file)`, `routeHref(slug, mountPath)` and `isNote(file)`. Code that must predict a route, such as a server refusing a new note that would take an existing page's URL, can import it. It has no dependencies, so server bundles can import it too.
- 8bdba67: `@svartz/plugins/preview` finds attachments as the build does: from the note's folder, then by vault path, then by a file name no other attachment has, so Obsidian's shortest links such as `![chart](chart.png)` show their image. `![[…]]` attachment embeds render as images, audio, video, PDF frames or links. `renderPreview` takes the published attachments' vault paths as `attachments`, and as `sharedNames` the file names unpublished files share with them; a link to any other file, or by a shared name alone, stays unresolved. `publishedAttachments(ctx)` lists the attachments a build publishes, and `sharedAttachmentNames(ctx)` those shared names.

### Patch Changes

- 64ba28f: Preserve authored title and description properties in the index while keeping generated display values in Markdown copies.
- 9e3cabc: Preserve embed syntax inside inline, fenced, and indented code when publishing notes and rendering the Split preview, including code in embedded notes.
- 101770b: Render callouts in CRLF notes like LF notes in published pages and the Split preview.
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
  - @svartz/core@2.4.0

## 2.3.0

### Minor Changes

- e199cef: A note without a `title` is titled by its filename as written, as in Obsidian: `My Approach to Mastering.md` stays "My Approach to Mastering" and `create-plugin.md` stays "create-plugin". Add a `title` to keep a different one.
- bdc5800: `index: { markdown: true }` puts each note's body in its index entry as Markdown with links resolved, for hosts that render notes with their own renderer.

### Patch Changes

- 0a0cfba: A frontmatter date without an offset is read as UTC, so `created_at: 2023-09-08T00:00` is 8 September on every build machine rather than 7 September on one east of UTC.
- Updated dependencies [bdc5800]
  - @svartz/core@2.3.0

## 2.2.0

### Patch Changes

- @svartz/core@2.2.0

## 2.1.3

### Patch Changes

- @svartz/core@2.1.3

## 2.1.2

### Patch Changes

- @svartz/core@2.1.2

## 2.1.1

### Patch Changes

- @svartz/core@2.1.1

## 2.1.0

### Patch Changes

- @svartz/core@2.1.0

## 2.0.0

### Patch Changes

- 26588ee: `theme.base` accepts a list of themes to compose in one site: `theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'] }`. Svartz composes every listed theme's `extensions` with theme-minimal's `composeThemes`; the first listed theme styles the site, and the other `theme` keys apply to all of them. Each relative entry resolves from the config directory. A listed theme that exports no `extensions` fails the build.

  In `@svartz/vite`, `resolveThemeModuleIds` replaces `resolveThemeModuleId`, and `resolveThemeRuntimeImport` replaces `resolveThemeRuntimeImportId`; it returns a `ThemeImport`, the theme modules and composer for a list. `loadThemeModule` takes a map of workspace theme sources, and the CLI passes them in `SVARTZ_THEME_SOURCES` instead of `SVARTZ_THEME_SOURCE_ID` and `SVARTZ_THEME_SOURCE_PATH`.

- Updated dependencies [26588ee]
  - @svartz/core@2.0.0

## 1.2.1

### Patch Changes

- @svartz/core@1.2.1

## 1.2.0

### Patch Changes

- @svartz/core@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.

### Patch Changes

- Updated dependencies [67b759b]
  - @svartz/core@1.1.0

## 1.0.1

### Patch Changes

- dd069ad: Code blocks no longer emit a Svelte `a11y_no_noninteractive_tabindex` warning. The `<pre>` stays focusable so keyboards can scroll it.
- 6dd3049: Markdown links such as `[API](index.md)` resolve against the linking note's folder before vault-wide lookup, so sibling `index.md` files, `../` paths, and duplicate filenames reach the right note and its heading anchor.
- @svartz/core@1.0.1

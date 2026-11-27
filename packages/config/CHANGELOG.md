# @svartz/config

## 2.7.0

### Minor Changes

- e9359b2: Eight colour schemes ship with Svartz: ports of Catppuccin, Rosé Pine, Nord, Gruvbox, Tokyo Night, Dracula, Solarized and Everforest. Import one by name and use it as a vault's `theme.tokens`:

  ```ts
  import { catppuccin } from "@svartz/config/schemes";

  theme: { base: "@svartz/theme-minimal", tokens: catppuccin },
  ```

  Each sets every colour token for light and dark mode, so the colour-mode toggle switches the whole palette. Body text, muted text, links, highlights, the accent and labels on accent buttons meet WCAG AA in both modes, as the default palette does. Spread a scheme to change one token: `tokens: { ...nord, accent: "oklch(0.6 0.12 160)" }`. Each port keeps its source's license and credit in the package's `THIRD-PARTY-NOTICES.md`.

- 0b7e0ca: `llms.txt` follows [llmstxt.org](https://llmstxt.org/) more closely. It has a `##` section per top-level folder, in explorer order, instead of one flat Pages list, and links `llms-full.txt`, a new file that holds every page's Markdown in the same order. Set `discovery: { llms: { optional: true } }` to list tag pages, folder listings and the feed under `## Optional`, which agents can skip. Every link in `llms-full.txt` is absolute, or root-relative below the deployment base without `site.url`. Each page keeps its own reference links and footnotes, and a code fence left open at the end of a page closes there. A host route at `llms-full.txt` wins, as one at `llms.txt` already did. A page whose `.md` URL a host route owns still appears in `llms-full.txt`.

  A note without a `description` now takes its first paragraph, cut at the last whole sentence within 300 characters, so a description never ends mid-sentence. A hard break counts as a space, and a note that is only an embed gets no description. This applies wherever descriptions show, including page metadata, search and RSS. Inline code and hyphenated words stay in it, and embeds stay out.

- 38c347c: Each vault served at the origin root writes its own `robots.txt`, beside `sitemap.xml`. It names the sitemap's absolute URL whenever the sitemap is on, and still admits every crawler by default. `discovery.robots` chooses who comes in: `bots: false` blocks every crawler, `training: false` keeps search engines and AI search and agent fetchers while blocking AI training crawlers such as GPTBot, ClaudeBot and Google-Extended, and `bots: false, search: true` admits only search. `rules` adds groups for any other crawler, such as `{ userAgent: "Amazonbot", disallow: ["/drafts/"] }`, and `contentSignals: { search: true, aiInput: true, aiTrain: false }` adds Cloudflare's `Content-Signal` line. A vault below the origin root, under a mount or a deployment base, writes none, since crawlers fetch only `/robots.txt`. A host app's own `robots.txt` takes priority, whether it's a route or a file in `static/`; any other file in the host's `static/` folder at the vault's mount likewise takes priority over a generated discovery file of the same name, and `svartz dev` notices one as it's added or removed.

### Patch Changes

- Updated dependencies [a766950]
- Updated dependencies [0b7e0ca]
- Updated dependencies [38c347c]
- Updated dependencies [5411016]
  - @svartz/core@2.7.0

## 2.6.0

### Patch Changes

- Updated dependencies [8f0291d]
- Updated dependencies [ba0f490]
  - @svartz/core@2.6.0

## 2.5.0

### Patch Changes

- Updated dependencies [34fe812]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
  - @svartz/core@2.5.0

## 2.4.0

### Minor Changes

- a4c869f: One sign-in covers every host vault in an app. Every vault's sign-in runs through `callbackVault` (default: the first host vault that enables auth), so each provider needs one callback URL, and the session reads as signed in on every vault. A `callbackVault` that names no vault, a vault without auth, or a vault missing one of the providers fails config loading, naming the vault. Plugins can now read sibling vaults through a `forVault({ vault, vaults })` hook that runs at config resolution. See "Several vaults" in `docs/auth.md`.
- 639e96d: A plugin can answer requests at runtime: give it `server: { module, options }` and a standalone vault on `cloudflare-workers`, `cloudflare-pages` or `node` routes `/_svartz/<plugin-id>/` to its handler while pages stay prerendered. A `static` vault with such a plugin fails the build, naming the vault and plugin. Secrets in options are named with `{ env: "NAME" }`. See `docs/server-plugins.md`.

### Patch Changes

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

- bdc5800: `index: { markdown: true }` puts each note's body in its index entry as Markdown with links resolved, for hosts that render notes with their own renderer.

### Patch Changes

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

### Minor Changes

- 26588ee: `theme.base` accepts a list of themes to compose in one site: `theme: { base: ['@svartz/theme-api-docs', '@svartz/theme-mcp-docs'] }`. Svartz composes every listed theme's `extensions` with theme-minimal's `composeThemes`; the first listed theme styles the site, and the other `theme` keys apply to all of them. Each relative entry resolves from the config directory. A listed theme that exports no `extensions` fails the build.

  In `@svartz/vite`, `resolveThemeModuleIds` replaces `resolveThemeModuleId`, and `resolveThemeRuntimeImport` replaces `resolveThemeRuntimeImportId`; it returns a `ThemeImport`, the theme modules and composer for a list. `loadThemeModule` takes a map of workspace theme sources, and the CLI passes them in `SVARTZ_THEME_SOURCES` instead of `SVARTZ_THEME_SOURCE_ID` and `SVARTZ_THEME_SOURCE_PATH`.

### Patch Changes

- b853e4f: Configs written for Svartz 1 keep loading under Svartz 2. The `version` in `svartz.config.ts` names the config format, whose major stays 1 until a 1.x config stops working, rather than following the package's major.
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

- @svartz/core@1.0.1

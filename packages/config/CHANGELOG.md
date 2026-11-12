# @svartz/config

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

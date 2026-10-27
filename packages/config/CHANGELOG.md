# @svartz/config

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

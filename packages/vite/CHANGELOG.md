# @svartz/vite

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

# svartz

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

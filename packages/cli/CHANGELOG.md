# svartz

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

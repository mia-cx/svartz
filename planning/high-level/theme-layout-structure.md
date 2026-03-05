# Theme layout structure

## Who defines layouts

**Themes define layouts.** The app (apps/web) and vault `.md` files import layout components from the chosen theme package (e.g. `@svartz/theme-minimal`). No Vite plugin is needed for layout resolution — it’s standard ESM. The plugin only handles **vault content** (pipeline, artifacts).

## Layering

1. **@svartz/ui** — Shared components (callouts, code blocks, cards, typography). Used by themes and by custom user themes.
2. **@svartz/theme-minimal** — Bare minimum theme. Imports from `@svartz/ui`; **exports the required layouts** (e.g. `DefaultLayout`, `NoteLayout`). Minimal styling and structure.
3. **Other themes (e.g. @svartz/theme-package-docs)** — Import theme-minimal and either:
   - **Pass through** its layouts (re-export), or
   - **Override** by exporting their own layouts with the same names (and optionally using theme-minimal’s components under the hood).

So theme-minimal is the **contract**: every theme must export the same layout names. Richer themes can replace the implementation.

## Scaffold: themes/minimal as a Svelte library

- Package at **packages/themes/minimal** (or **themes/minimal** in the repo).
- Build as a Svelte library (e.g. with svelte-package or similar); publishable as `@svartz/theme-minimal`.
- Exports:
  - Layout components (e.g. `DefaultLayout.svelte`, `NoteLayout.svelte`).
  - Any shared blocks used by those layouts (from `@svartz/ui` or local).
- **No** dynamic component loading for layout selection — the app and mdsvex import from the theme package directly. Which theme is used is decided by config; the build uses that theme’s package.

## Why before the Vite plugin

- apps/web needs **something** to import for layouts. theme-minimal provides that contract.
- The Vite plugin only cares about vault → artifacts; it doesn’t need to know about themes. So theme-minimal (and optionally @svartz/ui) can be scaffolded first, then apps/web, then the plugin.

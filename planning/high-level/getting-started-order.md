# Suggested order to get started

## 1. @svartz/ui (packages/ui)

- Shared component library: callouts, code blocks, layout primitives, typography.
- Used by theme-minimal and by custom themes.
- Svelte components + Tailwind; publishable as `@svartz/ui`.

## 2. theme-minimal (packages/themes/minimal or themes/minimal)

- **Bare-minimum theme** as a Svelte library.
- Imports from `@svartz/ui`; exports the **required layouts** (e.g. `DefaultLayout`, `NoteLayout` or whatever the minimal set is).
- Other themes (e.g. theme-default) will **import theme-minimal** and re-export or override layouts.
- Publishable as `@svartz/theme-minimal`. Gives a clear layout contract before apps/web or the plugin.

## 3. apps/web scaffold

- SvelteKit app with static adapter (or adapter chosen by env).
- Basic layout, placeholder routes: `/`, `/[...slug]` that *expect* generated artifacts and **import layouts from the theme package** (e.g. `@svartz/theme-minimal`).
- mdsvex wired up for `.md`. Gives a clear **contract**: the app consumes artifacts from the plugin and layouts from the theme.

## 4. Content-pipeline package (before or in parallel with the plugin)

- **packages/content-pipeline** (or **@svartz/vault**): vault walking, wikilink resolution, slug rules, minimal manifest (e.g. `{ slugs, graph?, searchIndex? }`).
- Testable without Vite. See [content-pipeline-vs-vite-plugin.md](./content-pipeline-vs-vite-plugin.md): this package holds all vault/obsidian logic; the Vite plugin only imports and runs it.

## 5. packages/vite-plugin (@svartz/vite-plugin)

- Plugin reads `VAULT_DIR` (and related env), **calls the content-pipeline package**, writes output to `src/lib/generated/`.
- **Does not handle theme/layouts** — those come from the theme package via normal ESM imports in the app. Plugin only invokes pipeline and writes artifacts.
- `buildStart`: run pipeline once. `configureServer`: run pipeline + watch + HMR.
- Add to apps/web’s `vite.config.ts`; confirm artifacts exist and routes can read them.

## 6. Then iterate

- Expand content-pipeline package (graph, backlinks, search index).
- theme-default (extends theme-minimal), more layouts.
- CLI commands that set env and invoke Vite (dev, build, preview).

---

## Summary

**First:** @svartz/ui → **theme-minimal** (Svelte library exporting layouts, using ui).  
**Then:** apps/web scaffold (imports theme-minimal).  
**Then:** content-pipeline + **Vite plugin** (vault resolution only; layouts stay theme-driven via imports).  
**Then:** Expand pipeline and themes in lockstep.

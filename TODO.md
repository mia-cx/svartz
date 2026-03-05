# SvelteKit Rewrite (Quartz-inspired) — TODO
This branch is a from-scratch rewrite of Quartz's site generator using SvelteKit, using Quartz v4 as a reference implementation for parsing/transforms, graph/backlinks, and search.

## Goals
- Publish an Obsidian vault as a website (mdsvex-first).
- Treat vault `.md` files as mdsvex input (Obsidian defaults to `.md`, so this should be seamless).
- Support multiple deployment modes via SvelteKit adapters:
  - static SSG/prerendered output (default)
  - optionally SSR-capable adapters (Node, Cloudflare, etc.) for dynamic features
- Obsidian-flavored Markdown support:
  - `[[wikilinks]]` + aliases `[[Page|Label]]`
  - embeds/transclusions `![[Note]]` (at least note-level; block-level optional)
  - tags, frontmatter, callouts, footnotes
  - attachments/images (local files)
- Backlinks + forward links, with a computed graph.
- Client-side search powered by a build-time index.
- A clean themeable UI implemented in Svelte (Quartz-like UX, not necessarily identical).
- Provide a small set of default themes.
  - Themes are *product-level presets*, not just CSS: they can fully change layout, navigation, page types, routes, components, and ship/bundle recommended plugins + default config.
  - Notes vault theme: similar to Quartz default / Obsidian Publish "collection of notes".
  - Package docs theme: geared towards JS/TS package documentation (JSDoc/TSDoc), with optional GitHub source links; may bundle a docs plugin that parses JSDoc/TSDoc from a configured codebase.
  - API docs theme: REST and/or GraphQL docs; bundles API-specific plugins (schema import, example generation, endpoint modeling) and supports switching API versions while staying on the same relative page.
  - TTRPG wiki theme: worldbuilding wiki (regions, nature, cities, politics), lore, monsters, characters; bundles taxonomy + entity page plugins.
- An extensible Svartz plugin ecosystem (not necessarily compatible with Quartz plugins):
  - clearly defined plugin API
  - composable transforms
  - ability for users to add/disable/parameterize plugins via config

## Non-goals (initially)
- Perfect 1:1 compatibility with every Obsidian plugin syntax.
- ~~Multi-vault support.~~ *(Now supported: `svartz.config.mjs` `vaults[]`.)*
- Full Quartz plugin compatibility.
- A full theme marketplace (just a solid theming mechanism).
- Obsidian plugin for mdsvex support (long-term future).

## Long-term ideas (post-MVP)
- **Obsidian plugin for Svartz mdsvex support:** Render `.md` files in Obsidian with Svelte component syntax, live preview. Requires Svelte renderer in Obsidian; speculative but cool.

## High-level architecture
- SvelteKit app for routing/layouts/UI.
- Build-time content pipeline:
  - Walk vault -> parse markdown -> apply transforms -> render note pages
  - Emit derived artifacts (manifest, graph, search index) into `src/lib/generated/…`.
- Plugin system modeled after Quartz concepts but designed for SvelteKit:
  - pipeline phases (discover -> parse -> transform -> index -> render)
  - stable data structures between phases

## Repo layout proposal
- `apps/site/` (SvelteKit)
- `packages/content-pipeline/` (vault reader, transforms, graph, indexing)
- `packages/markdown/` (remark/rehype plugins for Obsidian dialect)
- `packages/themes/` (optional: shared theme building blocks)
- `vault/` (sample content fixture for development/testing)
- Turborepo for task running + caching across packages/apps.

## Milestones
### M0 — Spike (remaining)
- Wire one prerendered note page with a Svelte layout (app has no `/notes/[...slug]` yet).
- Optionally formalize plugin shape (currently config/vault options drive behavior).

### M1 — Minimal usable site
- Build and deploy a static site that:
  - renders notes
  - resolves wikilinks
  - shows backlinks
  - has basic nav + index page

### M2 — Feature parity (core)
- Transclusions, callouts, tags, graph view, search, RSS/sitemap.

### M3 — SSR adapter support (optional)
- Validate SSR adapter builds with the same content pipeline artifacts.
- Add optional SSR-only features (behind a flag), e.g. server search API, view counters, auth.

### M4 — Polish
- Theming, performance, accessibility, documentation, migration guides.

## Detailed TODO

### 1) Define Svartz plugin system (core)
- Define a plugin interface and pipeline phases (data models exist in `@svartz/vault`).
  - *Config:* `plugins[]` on `svartz.config` (top-level or per-vault). In config you import each plugin’s default export and pass options to it; that export returns a “configured plugin” (e.g. a function). The Vite plugin then calls that function with `VaultFile[]` as input.
  - *Note:* `@svartz/vault` (traverse + buildIndex) is conceptually a Svartz plugin too — likely the first/default one, taking vault path + config and producing the `VaultFile[]` (or Index) that downstream plugins consume.
- Define plugin ordering rules + composition:
  - explicit phase ordering
  - ability to insert before/after named plugins
- Define config format for enabling/disabling plugins + plugin options (per-plugin options passed when importing in config).
- Add a minimal plugin runner with good error messages.

### 2) Bootstrap SvelteKit
- Configure for static output in `apps/web`:
  - use static adapter (or document adapter choice)
  - enable prerendering
- Add basic routes:
  - `/notes/[...slug]` (note pages)
  - `/tags/[tag]` (optional early)

### 4) Obsidian Markdown support (mdsvex + plugins)
- Implement remark plugins (or unified pipeline) for:
  - wikilinks -> `<a href>` with correct resolved slugs
  - embeds `![[…]]` -> inline rendered note preview (v1 can be "include full note" or "include excerpt")
  - callouts -> HTML structure with classes
  - block refs (optional) `^blockid` + `[[note#^blockid]]`
- Decide how to handle:
  - Mermaid / diagrams
  - Math (KaTeX)
  - syntax highlighting

### 5) Graph + backlinks
- Expose graph + backlinks to SvelteKit pages via generated JSON (graph data already in `Index`).

### 6) Search
- Generate a search index at build time:
  - title, headings, tags, excerpt, slug
- Add client-side search UI.
- Decide on search library (MiniSearch/FlexSearch/etc.) and index format.

### 7) Site UX
- Layout primitives:
  - header/nav
  - left sidebar (folder tree or backlinks/tags)
  - right sidebar (toc/backlinks)
- Note page UI:
  - title + metadata
  - rendered content
  - backlinks section
- Index pages:
  - all notes
  - by tag

### 7.1) Themes (default set)
- Define a theme API boundary.
  - Themes are allowed to:
    - provide full Svelte layouts + components
    - provide/override routes and page templates (within a stable Svartz route contract)
    - register navigation structure (sidebars, sections, landing pages)
    - ship/bundle recommended plugins (and their default config)
    - add new "content types" beyond notes (e.g., endpoints, symbols, monsters)
  - Themes are *not* only CSS; however, they should still support basic color/typography theming.
  - Shared data contracts from the pipeline:
    - notes + frontmatter schema
    - graph/backlinks
    - search docs
    - optional theme-defined derived artifacts
- Define how themes are selected/loaded:
  - `svartz.config.ts` selects one theme package (plus optional additional plugins)
  - theme package exports: `themeId`, `routes`, `layouts`, `components`, `plugins`, `defaultConfig`
- Implement themes:
  - Notes vault theme (Quartz/Obsidian Publish-like)
  - Package docs theme:
    - optional config: `repoUrl`, `defaultBranch`, `sourcePathPrefix`
    - bundled plugin: parse JSDoc/TSDoc from a configured codebase and surface it as pages
  - API docs theme:
    - model API versions and provide a version switcher that preserves relative page
    - render endpoint pages with methods + example requests/responses
    - bundled plugins: OpenAPI/GraphQL schema import + normalization + example snippets
  - TTRPG wiki theme:
    - templates for regions/cities/factions/characters/monsters
    - navigation around taxonomies (tags/frontmatter-driven)
    - bundled plugins: entity indexing + relationship graph views

### 8) Static assets + attachments
- Copy vault assets into the built site.
- Rewrite image links to the correct public paths.
- Decide conventions for:
  - `![[image.png]]`
  - standard markdown `![](path)`

### 9) SEO + feeds
- Sitemap generation.
- RSS/Atom feed (optional).
- OpenGraph + meta tags.

### 10) Dev experience
- Watch mode:
  - detect vault changes
  - rebuild affected pages
  - refresh dev server
- Caching:
  - content hashing
  - incremental graph/index recompute
- **CI / GitHub workflows:** Document GitHub Actions workflow YAMLs so people can set up their Svartz instance with CI (see `planning/cli-turbo-orchestration.md` for cache strategy: pnpm store + `**/node_modules` + `.turbo` with constant key for Turbo).

### 12) Migration notes
- Document mapping from Quartz v4 to this rewrite:
  - config changes
  - plugin equivalents
  - unsupported features

## Open questions
- **l10n/i18n:** Look into a shared package that themes and `apps/web` can import for community translations. Evaluate Paraglide (or similar) for runtime + compare TMS options (Tolgee, Weblate, Lokalise, etc.). *(Tracked in GitHub.)*

## Resolved
- **Notes can import Svelte components:** Yes. Vault notes can import Svelte components; the Vite plugin preprocesses vault `.md` with mdsvex (see `planning/component-resolution-mdsvex-themes.md`).
- **Canonical slug policy:** Path-based, matching Quartz (e.g. `path/to/file.md`).
- **Embeds / block refs (Obsidian parity):** Match Quartz. Image embeds (`![[image]]`, optional dimensions); note embeds — full page (`![[file]]`), section under header (`![[file#Anchor]]`), block ref (`![[file#^block-id]]`); callouts (Obsidian admonition syntax, e.g. `> [!info]`). See `packages/reference/docs/features/wikilinks.md`, `callouts.md`, and `ObsidianFlavoredMarkdown` plugin.
- **Content folder / vault root:** New config pattern (not Quartz's single folder). `svartz.config.mjs` supports **multiple vaults**; each vault has `id`, `path`, `include`/`exclude`, `frontmatter`, `target`. See `packages/config/` and `packages/vault/tests/fixtures/config-mode/svartz.config.mjs`.
- **SSR / deployment adapters:** Validate first: **static** (GitHub Pages), **Node**, **Cloudflare**. Supporting all SvelteKit adapters (Netlify, Vercel, etc.) should be relatively trivial since the adapter API is uniform; document recipes as needed.

## Suggested next action
- Wire note routes and one prerendered note page (finish M0).
- *After vault changes are done:* Define an implementation contract and plan for the plugin system in `@svartz/core`, then implement that for vault.

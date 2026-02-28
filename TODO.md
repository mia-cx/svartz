# SvelteKit Rewrite (Quartz-inspired) — TODO
This branch is a from-scratch rewrite of Quartz’s site generator using SvelteKit, using Quartz v4 as a reference implementation for parsing/transforms, graph/backlinks, and search.

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
  - Notes vault theme: similar to Quartz default / Obsidian Publish “collection of notes”.
  - Package docs theme: geared towards JS/TS package documentation (JSDoc/TSDoc), with optional GitHub source links; may bundle a docs plugin that parses JSDoc/TSDoc from a configured codebase.
  - API docs theme: REST and/or GraphQL docs; bundles API-specific plugins (schema import, example generation, endpoint modeling) and supports switching API versions while staying on the same relative page.
  - TTRPG wiki theme: worldbuilding wiki (regions, nature, cities, politics), lore, monsters, characters; bundles taxonomy + entity page plugins.
- An extensible Svartz plugin ecosystem (not necessarily compatible with Quartz plugins):
  - clearly defined plugin API
  - composable transforms
  - ability for users to add/disable/parameterize plugins via config

## Non-goals (initially)
- Perfect 1:1 compatibility with every Obsidian plugin syntax.
- Multi-vault support.
- Full Quartz plugin compatibility.
- A full theme marketplace (just a solid theming mechanism).

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

(If we prefer not to monorepo, collapse these into top-level `src/` + `scripts/`.)

## Milestones
### M0 — Spike (1–2 days)
- Lock in Markdown strategy: mdsvex-first everywhere (treat `.md` as mdsvex).
- Prove we can:
  - read a vault directory
  - resolve wikilinks
  - prerender one note page with a Svelte layout
- Prove the plugin shape with one trivial plugin (e.g., add a generated “reading time” field).

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
### 0) Decide the rewrite shape
- Commit to monorepo layout and scaffold Turborepo.
- Decide whether this branch should be an “in-repo rewrite” or a clean subdir (recommended: `apps/site`).
- Decide what we keep from Quartz config UX:
  - reuse `quartz.config.ts` semantics?
  - or define a new `svartz.config.ts`?
- Decide adapter strategy:
  - default `adapter-static`
  - provide documented recipes for Node/Cloudflare/etc.

### 1) Define Svartz plugin system (core)
- Define a plugin interface and pipeline phases.
- Define core data models (types):
  - `VaultFile`, `Note`, `LinkRef`, `Graph`, `SearchDoc`, `RenderArtifact`
- Define plugin ordering rules + composition:
  - explicit phase ordering
  - ability to insert before/after named plugins
- Define config format for enabling/disabling plugins + plugin options.
- Add a minimal plugin runner with good error messages.

### 2) Bootstrap SvelteKit
- Add SvelteKit scaffold (likely under `apps/site`).
- Configure for static output:
  - use static adapter
  - enable prerendering
- Add basic routes:
  - `/` (home)
  - `/notes/[...slug]` (note pages)
  - `/tags/[tag]` (optional early)

### 3) Content pipeline (vault -> manifest)
- Implement vault discovery:
  - configurable vault root
  - ignore `.obsidian/`, templates, etc.
- Implement canonical slugging rules:
  - path-based slugs vs title-based slugs
  - handle collisions deterministically
- Parse frontmatter:
  - title override
  - description
  - created/updated dates
  - tags
- Produce a build manifest:
  - list of notes
  - per-note metadata
  - outbound link refs (pre-resolve)

### 4) Obsidian Markdown support (mdsvex + plugins)
- Add mdsvex integration.
- Configure mdsvex to process `.md` files (treat Obsidian’s default markdown files as mdsvex).
- Implement remark plugins (or unified pipeline) for:
  - wikilinks -> `<a href>` with correct resolved slugs
  - embeds `![[…]]` -> inline rendered note preview (v1 can be “include full note” or “include excerpt”)
  - callouts -> HTML structure with classes
  - block refs (optional) `^blockid` + `[[note#^blockid]]`
- Decide how to handle:
  - Mermaid / diagrams
  - Math (KaTeX)
  - syntax highlighting

### 5) Graph + backlinks
- Build link graph from manifest:
  - nodes: notes
  - edges: resolved note-to-note links
- Compute backlinks per note.
- Expose graph + backlinks to SvelteKit pages via generated JSON.

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
    - add new “content types” beyond notes (e.g., endpoints, symbols, monsters)
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

### 11) Testing + fixtures
- Add a small fixture vault under `vault/`.
- Unit tests for:
  - wikilink resolution
  - slugging
  - graph/backlinks
  - embed expansion
  - plugin ordering/compat

### 12) Migration notes
- Document mapping from Quartz v4 to this rewrite:
  - config changes
  - plugin equivalents
  - unsupported features

## Open questions
- Do we want “notes can import Svelte components” (mdsvex power-user feature) or keep notes purely content?
- What’s the canonical slug policy (path vs title)?
- How much Obsidian parity is required for embeds/block refs?
- Do we keep Quartz’s existing content folder conventions or adopt a new vault root?
- Which SSR adapters do we want to officially validate first (Node vs Cloudflare vs Vercel)?

## Suggested next action
- Agree on:
  - vault root location
  - slug policy
  - whether embeds should inline full notes or excerpts
  - whether mdsvex should allow component imports
Then implement M0 spike and iterate.

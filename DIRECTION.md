# Svartz direction

## What it is for

Svartz publishes Obsidian vaults as SvelteKit sites, in the spirit of Quartz: one config, several vaults, Markdown that stays inert, and themes for notes, wikis, blogs, package docs, and API and MCP reference. It must stay simpler than the problems it solves; a theme author should declare what differs, not rebuild a site.

## Where it is heading

- **theme-minimal is the base of every theme.** Its layout is the one shell: explorer, search, breadcrumbs, contents, previous and next, the phone drawer, and accessibility work. Default themes extend it by swapping a frame or regions, adding page renderers chosen by frontmatter, and switching furniture; a fix in minimal reaches every theme.
- **Themes compose.** A vault lists the themes it combines in config, or uses a theme package that composes others. The first theme styles the site. Each page picks the theme that renders it: its `theme:`, its nearest folder note's, a renderer detecting its metadata, then the first theme.
- **`@svartz/ui` holds building blocks only**: primitives, content components, schema trees, code panels, renderer types. No shell grows there again.

## Current state (November 2026)

- 2.3.0 is published; the release PR (#285) collects everything below. 2.0 brought the extension contract, the compositor, all five default themes as extensions of minimal, and `theme.base` lists (PRD #203). 2.1 renders WebSocket endpoints and browser routes as reference operations.
- Plugins can answer requests at runtime (`/_svartz/<id>/`, PRD #245) on standalone Node and Cloudflare targets and in host apps through `svartzHandle`. Pages stay prerendered.
- Readers sign in with GitHub, Google, Discord or X (`@svartz/auth`). On that base, `@svartz/plugin-annotations` lets them comment on and +1 passages (D1, with comments that survive light edits). `@svartz/plugin-submissions` (private until its npm bootstrap) turns edits and new pages into pull requests, from an editor with Live Preview, Source, Split and Rich text modes that never changes a byte the reader didn't touch.
- SvelteKit 2 and 3 hosts both build and render Svartz pages; index-only hosts import `virtual:svartz/index`.
- Waiting on Mia: the reaction drawings (#281) that unblock reactions (#270, #271, #276, #277), the mia.cx sign-in notice (#282), and whether Bluesky sign-in (#254) becomes an auth provider.
- Logitland's docs (staging.logit.land/docs) consume the published API and MCP themes as a `theme.base` list.

## Decisions

- Every default theme extends theme-minimal; a separate reference shell was a mistake because it dropped minimal's explorer (Mia, October 2026).
- In a composed site, one shell styles every page; a page's theme renders its body and right column, never the whole chrome, so navigation never jumps.
- Themes may swap any region, the explorer included; swapped regions receive minimal's shell state so behaviour stays inherited.
- List pages belong to the first theme; a folder note's `theme:` picks its folder's list page.
- Conflicts fail the build with the page path rather than choosing silently.
- The config file format keeps its own major (`CONFIG_FORMAT_MAJOR`), separate from the package major, so a package major never breaks existing configs.
- Reference pages show only what the frontmatter states: a page without `operation` stays a guide, and no method is inferred from a title.
- The submissions editor keeps one CodeMirror document for every mode; Rich text is not ProseMirror or Milkdown, because those rebuild Markdown on save and rewrite what they don't model (November 2026).
- The editor's Split preview runs the build's own Markdown steps, moved into browser-safe modules, so the preview and the site cannot drift; what only the build can do falls back visibly.
- The compositor ships as 2.0.0. `RELEASE_LINE` in `scripts/release-packages.mjs` names the major version; a changeset may declare `major` only to reach it.

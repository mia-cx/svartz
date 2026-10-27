# Svartz direction

## What it is for

Svartz publishes Obsidian vaults as SvelteKit sites, in the spirit of Quartz: one config, several vaults, Markdown that stays inert, and themes for notes, wikis, blogs, package docs, and API and MCP reference. It must stay simpler than the problems it solves; a theme author should declare what differs, not rebuild a site.

## Where it is heading

- **theme-minimal is the base of every theme.** Its layout is the one shell: explorer, search, breadcrumbs, contents, previous and next, the phone drawer, and accessibility work. Default themes extend it by swapping a frame or regions, adding page renderers chosen by frontmatter, and switching furniture; a fix in minimal reaches every theme.
- **Themes compose.** A vault lists the themes it combines in config, or uses a theme package that composes others. The first theme styles the site. Each page picks the theme that renders it: its `theme:`, its nearest folder note's, a renderer detecting its metadata, then the first theme.
- **`@svartz/ui` holds building blocks only**: primitives, content components, schema trees, code panels, renderer types. No shell grows there again.

## Current state (October 2026)

- 1.2.1 is published. It ships a nested reference sidebar as an interim fix.
- 2.0.0 is in progress on `feat/theme-compositor`, tracked by PRD #203 with slices #204–#211. The extension contract, the compositor, and API and MCP as extensions are built. Docs, wiki, blog, and config lists are in progress.
- Logitland's docs (staging.logit.land/docs) consume the published API and MCP themes and move to the composition after 2.0.0.

## Decisions

- Every default theme extends theme-minimal; a separate reference shell was a mistake because it dropped minimal's explorer (Mia, October 2026).
- In a composed site, one shell styles every page; a page's theme renders its body and right column, never the whole chrome, so navigation never jumps.
- Themes may swap any region, the explorer included; swapped regions receive minimal's shell state so behaviour stays inherited.
- List pages belong to the first theme; a folder note's `theme:` picks its folder's list page.
- Conflicts fail the build with the page path rather than choosing silently.
- The compositor ships as 2.0.0. `RELEASE_LINE` in `scripts/release-packages.mjs` names the major version; a changeset may declare `major` only to reach it.

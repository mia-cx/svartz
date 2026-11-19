# Svartz direction

## What it is for

Svartz publishes Obsidian vaults as SvelteKit sites, in the spirit of Quartz: one config, several vaults, Markdown that stays inert, and themes for notes, wikis, blogs, package docs, and API and MCP reference. It must stay simpler than the problems it solves; a theme author should declare what differs, not rebuild a site.

## Where it is heading

- **theme-minimal is the base of every theme.** Its layout is the one shell: explorer, search, breadcrumbs, contents, previous and next, the phone drawer, and accessibility work. Default themes extend it by swapping a frame or regions, adding page renderers chosen by frontmatter, and switching furniture; a fix in minimal reaches every theme.
- **Themes compose.** A vault lists the themes it combines in config, or uses a theme package that composes others. The first theme styles the site. Each page picks the theme that renders it: its `theme:`, its nearest folder note's, a renderer detecting its metadata, then the first theme.
- **`@svartz/ui` holds building blocks only**: primitives, content components, schema trees, code panels, renderer types. No shell grows there again.
- **A Svartz site can run a community wiki** (PRD #338, first for Wikiplace). Content stays in git; around it come accounts, permissions, saves that commit straight to the repository, a moderator dashboard on the site, moderation and page history, all as first-party `@svartz/*` packages.

## Current state (November 2026)

- 2.4.0 is published; the open release PR collects what has merged since. 2.0 brought the extension contract, the compositor, all five default themes as extensions of minimal, and `theme.base` lists (PRD #203). 2.1 renders WebSocket endpoints and browser routes as reference operations.
- Plugins can answer requests at runtime (`/_svartz/<id>/`, PRD #245) on standalone Node and Cloudflare targets and in host apps through `svartzHandle`. Pages stay prerendered.
- Readers sign in with GitHub, Google, Discord or X (`@svartz/auth`). On that base, `@svartz/plugin-annotations` lets them comment on and +1 passages (D1, with comments that survive light edits). `@svartz/plugin-submissions` (private until its npm bootstrap) turns edits and new pages into pull requests, from an editor with Live Preview, Source, Split and Rich text modes that never changes a byte the reader didn't touch.
- Community wikis (PRD #338) are in progress, one issue per slice (#339 to #355). Accounts have landed (#339): with a D1 database bound as `SVARTZ_DB`, signing in creates an account with a chosen handle and a session the site can end, server plugins read it with `readAccount`, and `admins` in config names who holds the `admin` role. Without the binding, sign-in stays identity-only. Next: permissions (#340) and plugin pages under `/-/` (#341).
- SvelteKit 2 and 3 hosts both build and render Svartz pages; index-only hosts import `virtual:svartz/index`. The workspace's own apps and `svartz init` run SvelteKit 3 (#336); published libraries use only APIs both majors share.
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
- Wiki content lives only in git, and an edit shows once the deploy finishes; nothing serves an edit ahead of the build (PRD #338, November 2026).
- Accounts have no passwords: people sign in through a provider, and an account links as many as they like.
- Who is an admin comes from config alone. No database value grants or removes the role, and a server plugin marked `eager` (auth is) starts before the site answers any request, so every worker reads the deployed list.
- Accounts live in a D1 binding with the fixed name `SVARTZ_DB`, because plugins read them with only `(request, env)` in hand.
- The compositor ships as 2.0.0. `RELEASE_LINE` in `scripts/release-packages.mjs` names the major version; a changeset may declare `major` only to reach it.

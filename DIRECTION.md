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
- Community wikis (PRD #338) are in progress, one issue per slice (#339 to #355). Four slices have landed:
  - Accounts (#339): with a D1 database bound as `SVARTZ_DB`, signing in creates an account with a chosen handle and a session the site can end, server plugins read it with `readAccount`, and `admins` in config names who holds the `admin` role. Without the binding, sign-in stays identity-only.
  - Permissions (#340): plugins declare `namespace:feature:action` permissions, grants live in D1, and `can()` answers who may do what on the site, a vault, a folder or a page. Annotations checks them.
  - Plugin pages (#341): server plugins render pages in the theme shell under `/-/`, and `/-/account/` is the first: linked sign-ins, sessions, display name and handle.
  - Commit mode (#344): with a GitHub App and accounts, the submissions plugin's `mode` decides where a save goes. In the default `permission` mode, a save commits straight to the branch when the account holds `submissions:commits:write` on the page, opens a pull request when it holds only `submissions:pull-requests:write`, and is refused when it holds neither. `commit` mode commits or refuses, and `pull-request` mode opens a pull request or refuses, whoever asks.
  - Next: the dashboard (#342), the GitHub mirror with edit status (#346) and user pages (#345).
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
- `guest` means everyone and `signed-in` everyone with an account; a grant to `signed-in` beats a grant to `guest` on the same object. `can()` refuses everything on a site without `SVARTZ_DB`, so a plugin that must work without accounts decides that case itself.
- Plugin pages render under `/-/` in the shell and answer plain HTML with forms that post to the plugin's own routes; `/_svartz/<id>/` stays raw HTTP. Page markup stays out of note rendering, so notes prerender exactly as before.
- Direct commits are made only by a GitHub App, never a token, authored as the account and committed by the App's bot user. GitHub can't sign a commit with a custom author, so they are unsigned.
- A direct commit never overwrites: when the file changed since the editor loaded it, or the branch refuses the commit, the save becomes a pull request and says why. So does a save whose frontmatter claims a route the account may not commit to, or one held by a page it may not commit to. Which page holds a route is judged from the last build, so a page added since isn't seen until the site rebuilds (#366).
- The compositor ships as 2.0.0. `RELEASE_LINE` in `scripts/release-packages.mjs` names the major version; a changeset may declare `major` only to reach it.

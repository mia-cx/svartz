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
- Community wikis (PRD #338) are in progress, one issue per slice (#339 to #355). Ten slices have landed:
  - Accounts (#339): with a D1 database bound as `SVARTZ_DB`, signing in creates an account with a chosen handle and a session the site can end, server plugins read it with `readAccount`, and `admins` in config names who holds the `admin` role. Without the binding, sign-in stays identity-only.
  - Permissions (#340): plugins declare `namespace:feature:action` permissions, grants live in D1, and `can()` answers who may do what on the site, a vault, a folder or a page. Annotations checks them.
  - Plugin pages (#341): server plugins render pages in the theme shell under `/-/`, and `/-/account/` is the first: linked sign-ins, sessions, display name and handle.
  - Commit mode (#344): with a GitHub App and accounts, the submissions plugin's `mode` decides where a save goes. In the default `permission` mode, a save commits straight to the branch when the account holds `submissions:commits:write` on the page, opens a pull request when it holds only `submissions:pull-requests:write`, and is refused when it holds neither. `commit` mode commits or refuses, and `pull-request` mode opens a pull request or refuses, whoever asks.
  - The dashboard (#342): `/-/dashboard/` lists every plugin panel the viewer holds the permission for. Its first panel, People & permissions, sets grants for accounts and roles, manages stored roles, and explains why an account may or may not do something. Grant and role changes go to an append-only audit log.
  - GitHub sync (#346): with the submissions plugin's `sync` option, App webhooks and a reconcile poll keep a D1 mirror of commits, pull requests, reviews, comments, workflow runs and deployments, and the editor shows a saved edit going committed, building, live or failed.
  - User pages (#345): the page `users/<handle>` is always its account's to edit. The owner's save commits and anyone else's goes to review, and `/-/account/` links the page or offers to create it. `auth({ userPages })` names the folder.
  - Groups (#343): a group has owners and members, and pages and folders linked to it. Its owners manage its members and can always edit what it owns; grants can name a group. Each group has a page at `/-/groups/<name>/` that only its members can open.
  - Recent edits (#348): a dashboard panel lists the wiki's commits, newest first, with who made each, the pages it changed and how far it got toward live.
  - Page history (#353): `@svartz/plugin-history` gives every published page a History action, the diff between any two revisions with the newer one rendered, and Recent changes for the whole wiki at `/-/changes/`. Revisions the mirror lacks are read from GitHub.
  - Next: reports and the moderation plugin (#351), My submissions (#347) and reputation (#350), all in review; then the moderators' Submissions panel (#349), suspensions and the audit log panel (#352), revert (#354) and contributions on user pages (#355).
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
- Auth owns the dashboard page and gates its panels, because core can't depend on auth; core only collects the panels plugins contribute. A vault needs auth for any panel to show.
- The `admin` role is config-only and can't be created, assigned or denied in the database. Holding the permission to edit grants or roles is as powerful as being an admin.
- GitHub sync is opt-in and needs D1. An edit's status is read only from the mirror, the poll runs when a reader's status check finds the mirror stale and never on a timer, and "live" means a successful run or deployment confirmed to contain the edit's commit, never a guess from timestamps.
- A commit belongs to a site account only when the site's own record of the save says so: the commit the site made, or the merge of a pull request the site opened. A commit's author, its committer and its `Svartz-Account` trailer are git metadata that whoever makes the commit chooses, so none of them counts on its own.
- User pages live in one vault per app, the vault that runs sign-in, because that vault allocates every handle and so knows which handles a page already holds. A host app whose vaults sign in through different vaults has no user pages. The owner override covers the page itself, not pages below it, and follows every handle the account has held.
- Owning content gives rights over content only. A user page's owner and a group's owners can always edit what they own, but a permission marked `administrative` (changing grants, linking groups, handling reports) comes only from the admin role or a grant.
- History and the Recent edits panel show a commit's summary only when every file it changed is published and the whole list is known, since a summary can name what the site keeps back. Otherwise they show its short SHA.
- A revision renders with the build's own Markdown steps and sanitizer, and one the build would have hidden or protected stays hidden in history too.
- A permission check costs one D1 call, and a page reads the mirror in batches, because a free Worker gets 50 D1 queries per request. A test holds the Recent edits view to 20.
- A handle always names the address its user page gets: spellings the route builder would serve elsewhere (`a--b`, `index`, a trailing `_index`) are refused.
- A change that lands on an object is authorized on that object, not on the vault its form was sent from: a grant needs `auth:grants:write` where the grant is, and roles, whose grants reach everywhere, need it on the whole site.
- A direct commit never overwrites: when the file changed since the editor loaded it, or the branch refuses the commit, the save becomes a pull request and says why. So does a save whose frontmatter claims a route the account may not commit to, or one held by a page it may not commit to. Which page holds a route is judged from the last build, so a page added since isn't seen until the site rebuilds (#366).
- The compositor ships as 2.0.0. `RELEASE_LINE` in `scripts/release-packages.mjs` names the major version; a changeset may declare `major` only to reach it.

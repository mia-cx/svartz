# @svartz/plugin-submissions

Readers edit a page, or write a new one, from your Svartz site, and the site opens a pull request on your GitHub repository. You review it like any other pull request: merge to accept, close to decline, push to the branch to change it. On a site with [accounts](#modes), trusted editors' saves commit straight to the branch instead.

## Set up

1. Give the vault a server target: `cloudflare-workers`, `cloudflare-pages` or `node`. A `static` vault with this plugin fails the build.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) for the repository with **Contents** and **Pull requests** set to *Read and write*. To have pull requests come from a bot instead, use a [GitHub App](#github-app).
3. Set it on the server as `SVARTZ_GITHUB_TOKEN`: `wrangler secret put SVARTZ_GITHUB_TOKEN` on Cloudflare, or the process environment on Node. Under `svartz dev`, put it in `.env`.
4. Add the plugin:

```ts
import { defineConfig } from "@svartz/config";
import { submissions } from "@svartz/plugin-submissions";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "wiki",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [submissions({ repo: "wikiplace/wikiplace.live", labels: ["submission"] })],
  }],
});
```

The site must be built from a git checkout of that repository, and the commit it was built from must be on GitHub: the editor reads each page's source at that commit.

### GitHub App

With a GitHub App, pull requests come from `<app name>[bot]` rather than from the token's owner, and no one's personal token sits on the server.

1. [Register a GitHub App](https://github.com/settings/apps/new) (under an organization: its **Settings → Developer settings → GitHub Apps**). It needs no callback. Without [GitHub sync](#github-sync) it needs no webhook either: untick **Webhook → Active**.
2. Under **Repository permissions**, set **Contents** and **Pull requests** to *Read and write*. **Metadata** stays *Read-only*, as GitHub requires.
3. Create the App, note its **App ID** (or **Client ID**), and under **Private keys** generate a key. GitHub downloads it as a `.pem` file.
4. **Install App** on the account that owns the repository, for that repository.
5. Set the whole `.pem` file on the server under a name of your choice, such as `SVARTZ_GITHUB_APP_KEY`: `wrangler secret put SVARTZ_GITHUB_APP_KEY < app.private-key.pem` on Cloudflare, or the process environment on Node. In a one-line `.env` value, write its line breaks as `\n`.
6. Name the App in the plugin:

```ts
submissions({
  repo: "wikiplace/wikiplace.live",
  app: { id: 1234567, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } },
})
```

The server signs a short-lived token with the key, finds the App's installation on `repo` (set `installation` to its ID to skip that lookup), and exchanges the token for an installation token limited to `repo`. It reuses that token until five minutes before it expires, an hour after it was made. When the key is missing or isn't one, GitHub rejects the App, or the App isn't installed on `repo`, the editor says so without showing the key.

| Option | Default | |
| --- | --- | --- |
| `repo` | required | The repository, as `owner/name`. |
| `branch` | the repository's default branch | The branch pull requests target. |
| `vaultRoot` | read from git | The vault folder's path inside the repository, such as `"content"`. Set it when the build doesn't run in the repository's checkout. |
| `labels` | none | Labels every pull request gets. |
| `token` | `{ env: "SVARTZ_GITHUB_TOKEN" }` | The server environment variable that holds the token. |
| `app` | none | `{ id, privateKey: { env: "NAME" }, installation? }`: open pull requests as a [GitHub App](#github-app) instead of with `token`. Set one or the other. Commits need an App. |
| `mode` | `"permission"` | Which saves commit straight to the branch: `"permission"`, `"commit"` or `"pull-request"`. See [Modes](#modes). |
| `sync` | none | `{ database: { env: "NAME" }, webhookSecret: { env: "NAME" }, live }`: mirror the repository's activity and show editors their edit going live. See [GitHub sync](#github-sync). |
| `signIn.required` | `false` | Only signed-in readers may submit. See [Sign-in](#sign-in). |
| `guard.turnstile` | none | `{ siteKey, secret: { env: "NAME" } }`: the editor shows a [Turnstile](#turnstile) challenge and the server verifies it. Skipped when sign-in is required. |
| `guard.rateLimit` | `{ limit: 10, period: 3600 }` | Submissions allowed per `period` seconds, per signed-in reader or per IP. See [Rate limit](#rate-limit). |

## What readers see

Every published Markdown note gets an **Edit** action beside Copy page. It opens a panel with the page's Markdown source, frontmatter included, and a **What changed** field. **Open pull request** submits it, and the panel links the new pull request. Beside the button, the panel says where the edit goes: "Goes to review before it goes live." When the reader's save will [commit](#modes), the button reads **Publish** and the line "Goes live once the site rebuilds."; once saved, the panel says "Published. It goes live once the site rebuilds." and links the commit.

### The editor

The source opens in **Live Preview**, as in Obsidian: headings, bold, italics, links, wikilinks, inline code, callouts, embeds and task checkboxes show formatted, and the line holding the cursor shows its Markdown. Clicking a task's checkbox, or pressing Space on it, ticks it. **Source** shows the raw Markdown throughout. **Split** shows the raw Markdown beside the page as the site renders it, with the theme's callouts, code blocks, images, links and embeds, and updates it a moment after the reader stops typing. Links and embeds of published notes and attachments resolve as they do on the site, an attachment found by its name included, and links to anything else show unresolved. What only the build can do stays plain: code isn't highlighted, math and diagrams show their source, and an embedded note shows its link without its body. On a phone, Split shows one side at a time under **Write** and **Preview** tabs. Clicking a link in the preview opens it in a new tab. The switch is remembered in the browser, and no mode changes a byte the reader didn't edit.

**Rich text** is for readers who don't write Markdown. The page shows formatted with no syntax anywhere, and a toolbar adds headings, bold, italics, bulleted and numbered lists, links, links to the site's pages and callouts. Bold, italic and link also answer to Ctrl+B, Ctrl+I and Ctrl+K (⌘ on a Mac). Each button writes Markdown into the same source, so switching to Live Preview or Source shows exactly what Rich text wrote. Enter continues a list or a callout, and Backspace at the start of a heading or list item turns it back into text. The frontmatter shows as a **Properties** panel above the page: each property's name and value, lists as comma-separated text, and anything more nested as its YAML. Editing a property rewrites only its own lines. What the toolbar can't write (tables, code blocks, HTML, footnotes, math, comments) shows as its Markdown, in a block of its own, and is edited as text. Rich text loads the first time a reader opens it.

Split's preview loads the first time a reader opens it, and renders in a web worker so typing never waits on it. A site's Content Security Policy allows the worker with `script-src 'self'` (or `worker-src 'self'`), as the standalone shell's does. A host app that renders notes without Svartz's runtime offers no Split.

Typing `[[` suggests the site's published notes. Arrow keys choose one, Enter inserts it as `[[Name]]`, or `[[folder/Name]]` when another note's name, slug or alias would take `[[Name]]`, and Escape closes the list. Password-protected and hidden notes are never suggested.

### Drafts

The editor saves what a reader writes in the browser's `localStorage` as they write it, per page (and one new page per vault), so a closed tab loses nothing and a crash loses at most the last moment of typing. The next time they open the editor on that page, it offers the draft back above the source with **Restore edit** and **Discard edit** (**Restore page** and **Discard page** for a new page); the fields take no writing until they choose. An edit's draft records a fingerprint of the source it was written against: if the page has changed on the site since, the offer says "This page changed since you saved this draft" and the restore button reads **Restore anyway**, since sending the draft would undo those changes. Drafts saved before fingerprints existed are offered as before. A draft is forgotten once its pull request opens, or when the reader discards it or closes the editor and confirms discarding their changes.

### New page

Every page gets a **New page** action in the site actions (the rail or site navigation). Its panel asks for a **Title** and a **Section**, then opens on a blank page with a **Why add this page** field. The sections are the vault's folders that hold a published note, plus its top level when that does. The page is saved as `<section>/<title>.md`, so the title is the note's name as in Obsidian, and its URL follows the vault's usual slug rules. A title that a page in that section already has is refused, with a link to that page.

A signed-in reader without a [user page](../../docs/auth.md#user-pages) gets **Create your page** on the account page, `/-/account/`, of the vault that holds user pages. It opens the same panel on `users/<handle>.md`, with the title and section fixed, even before the user page folder holds a published note.

## What maintainers get

- For an edit, a branch `svartz/submission/edit/<page>-<submission id>` from the commit the site was built from, with one commit replacing the note. When the page changed since, GitHub shows a conflict instead of the edit overwriting it. The pull request is titled `Edit <path>`.
- For a new page, a branch `svartz/submission/new/<vault folder>-<section>-<title>-<submission id>` from the same commit, with one commit adding the note. The pull request is titled `Add <path>`.
- Every pull request gets the configured labels, the reader's note, and the page or site it came from.
- A signed-in reader is named in the pull request with a link to their profile and the provider they signed in with, such as "Submitted by [Ada Lovelace](https://github.com/ada) (signed in with GitHub)". A reader signed in with GitHub also authors the commit, as their `<id>+<login>@users.noreply.github.com` address, so GitHub links it to their account. Google, Discord and X accounts have no GitHub account to link, so their commit keeps the token's owner, or the App, as author.

Each opened editor makes a random submission id and sends it with every attempt. When GitHub's answer is lost, a retry finds the pull request the first attempt opened instead of opening a second one. When GitHub refuses the pull request, the branch stays: another attempt at the same edit may be opening a pull request from it, and a retry reuses it. Every GitHub request gives up after 10 seconds, and the reader is told to try again.

Readers never choose a file path; the server works it out:

- An edit must name a published `.md` note. Password-protected notes, other files and paths outside the vault are refused.
- A new page must name a section from the list, or be the reader's own user page. Folders without a published note, folders holding only password-protected notes, and hidden folders are refused. So are titles that start with a dot or contain `\ / : * ? " < > | # ^ [ ]`, and titles over 120 characters.
- A new page is never written over a file. Before calling GitHub, the server refuses a title whose page would ask for a route that a published page of any type (`.md`, `.svx` and the rest, password-protected and hidden ones included) holds or asks for, as the build allocates routes: `ada-lovelace` and `Ada Lovelace` both clash with `Ada Lovelace.md`. Otherwise the new page would take that page's URL or push it to `-2`. Before writing anything, it also refuses a title whose file exists in the commit the site was built from, published or not.

A page's source is capped at 512 KB and the note at 2,000 characters.

## Sign-in

Readers sign in through the [`auth` plugin](../../docs/auth.md) on the same vault. Signed-in readers are credited in their pull request and get their own rate limit, whether or not sign-in is required.

To take submissions from signed-in readers only, set `signIn.required`:

```ts
plugins: [
  auth({ providers: { github: { clientId: "Ov23li…", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } } }),
  submissions({ repo: "wikiplace/wikiplace.live", signIn: { required: true } }),
]
```

The server then refuses anonymous edits and new pages with 401 `sign_in_required` before it calls GitHub, and Turnstile is skipped: the editor shows no challenge and the server verifies none. A vault that requires sign-in without the `auth` plugin fails the build.

Readers can open the editor and write while signed out. When they send, the editor saves their [draft](#drafts) and opens the sign-in dialog. Signing in brings them back to the same page, where the editor reopens at once with their source, note, title and section as they left them, ready to send. If the page changed on the site meanwhile, the editor offers the draft with the warning instead. If the page's source fails to load then, the draft reopens the next time the editor opens on the page. If the browser blocks storage, the editor says so and asks them to copy their changes before signing in.

## Modes

On a site with [accounts](../../docs/auth.md) (a D1 database bound as `SVARTZ_DB`), the server decides for every save, on the page it writes, whether it commits straight to the branch or opens a pull request. Without accounts, every save opens a pull request, under the sign-in and guard options above.

| `mode` | A save commits when | Otherwise |
| --- | --- | --- |
| `"permission"` (default) | the account holds `submissions:commits:write` on the page, and `app` is set | it opens a pull request when the reader holds `submissions:pull-requests:write` on the page, and is refused when they don't |
| `"commit"` | the account holds `submissions:commits:write` on the page | it is refused, so nobody's edit waits in review. A solo site whose owner is an admin needs nothing else. |
| `"pull-request"` | never | as `"permission"` |

A refused guest gets 401 `sign_in_required`, so the editor offers sign-in; a refused account gets 403 `not_allowed`.

The plugin declares four permissions, which admins grant on the site, a vault, a folder or a page (see [Permissions](../../docs/auth.md#permissions)):

| Permission | Allows | By default |
| --- | --- | --- |
| `submissions:pull-requests:write` | Sending an edit or a new page for review | Signed-in readers, and guests when [Turnstile](#turnstile) is on |
| `submissions:commits:write` | Saving straight to the repository | Admins only |
| `submissions:reviews:write` | Commenting on, reviewing, merging and closing submissions | Admins only |
| `submissions:pull-requests:read` | Seeing other people's submissions, and every edit on the dashboard's [Recent edits](#recent-edits) | Admins only |
| `submissions:own-submissions:read` | [Following your own submissions](#my-submissions): the panel, replies and follow-up edits. Declared only with [sync](#github-sync). | Signed-in readers |

Admins hold every permission, and each account holds every one on its own [user page](../../docs/auth.md#user-pages), `users/<handle>`, so its owner's edits there commit and everyone else's go to review. Vaults that share accounts must configure Turnstile alike, since the guest default comes from it and is shared.

### What commits need

Commits are made by a [GitHub App](#github-app): with `token` alone, every save opens a pull request. `mode: "commit"` without `app`, or on a vault without the `auth` plugin, fails the build. The build can't ask GitHub what the App may do, so give it what commits need before turning them on:

- **Contents** set to *Read and write*, as pull requests already need.
- If the branch is protected, the App allowed to push to it: under the branch's protection rule or ruleset, add the App to who may bypass required pull requests. A branch that requires a review for every change takes edits as pull requests only; use `mode: "pull-request"`.
- No rule requiring signed commits on the branch. Commits name the account as their author, and GitHub signs no commit that names its own author, so they are unsigned and such a branch refuses them.

Without Contents write, the first save that commits says GitHub refused the site's access. When GitHub refuses a commit for a rule on the branch, the save opens a pull request instead, answers `reason: "protected"`, and the server logs what GitHub said. The editor says "The repository's rules don't let the site publish your edit directly, so it went to review as pull request #42."

### How a commit lands

The editor sends the blob SHA of the source it loaded. The server reads where the branch points, and commits only when the file there still has that SHA, or, for a new page, when nothing is at its path. Otherwise it opens a pull request from the build commit instead, answers `reason: "changed"`, and the editor says "This page changed since you opened it, so your edit went to review as pull request #42." It never overwrites. The commit's parent is the commit it checked, and the branch only moves forward to it, so a save that lands in between makes GitHub refuse; the server then checks again on the new tip.

A restored draft written against an older source sends no SHA the branch could have, so it opens a pull request.

A note's frontmatter decides addresses too: its `slug` names its own, and its aliases (`alias`, the field `frontmatter.aliasesField` names, and `permalink`) ask for addresses that redirect to it. The server reads the saved Markdown as the build will, and commits only when the account holds `submissions:commits:write` on every address the note asks for that the page doesn't hold already, and on every other page holding one, which the note would move or take a redirect from. Otherwise, or when the build would refuse the slug, the save opens a pull request, answers `reason: "route"`, and the editor says "Your edit gives this page an address you can't publish to, so it went to review as pull request #42." An account that may edit only its own `users/<handle>` page can't take another user's address by giving its page `slug: <their handle>`.

Each commit is authored as the account and committed by the App's bot user:

```
Edit content/guide.md

Added the time it takes.

Co-authored-by: Ada Lovelace <583231+ada@users.noreply.github.com>
Svartz-Account: 0b9f6c1e-5d2a-4f8e-9b31-7c4d2e6a8f10
```

- **Author**: the account's display name and `<handle>@users.noreply.<site host>`, such as `ada@users.noreply.wiki.example`.
- **Committer**: the App's bot user, `<app slug>[bot]` and `<bot user id>+<app slug>[bot]@users.noreply.github.com`. The server looks both up once per worker, with `GET /app` and `GET /users/<app slug>[bot]`. The commit is unsigned.
- **`Co-authored-by`**: the account's linked GitHub account, by its noreply address, so GitHub credits it. Left out when the account has no GitHub sign-in linked.
- **`Svartz-Account`**: the account's id, so history can map the commit back to the account whatever its handle becomes.

The trailers are always the message's last paragraph, and names lose line breaks and angle brackets, so neither a display name nor the reader's note can add a trailer.

The site shows the edit once the deploy that includes the commit finishes.

## GitHub sync

With `sync`, the site keeps a mirror of the repository's activity in D1, filled by the GitHub App's webhooks, and the editor follows each saved edit until it is live. The mirror is what the moderator dashboard, history and user pages read.

```ts
submissions({
  repo: "wikiplace/wikiplace.live",
  app: { id: 1234567, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } },
  sync: {
    database: { env: "SVARTZ_DB" },
    webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" },
    live: { workflow: "deploy.yml" },
  },
})
```

| Option | |
| --- | --- |
| `database` | The D1 binding the mirror lives in. It may be the database [accounts](../../docs/auth.md) use, `SVARTZ_DB`: every table the plugin makes starts `submissions_`. |
| `webhookSecret` | The server environment variable holding the App's webhook secret. |
| `live` | What "live" means: `{ workflow: "deploy.yml" }`, a successful run of that file in `.github/workflows/` on the content branch, or `{ environment: "production" }`, a successful deployment to that environment. |

Sync needs D1, so the vault deploys to `cloudflare-workers` or `cloudflare-pages`; on `node` it fails the build.

### Set up

1. In the App's settings, under **Webhook**, tick **Active**, set **Webhook URL** to `https://<site><base><mount>/_svartz/submissions/github/webhook/` (with the trailing slash: GitHub doesn't follow the redirect a missing one gets), and set a **Webhook secret**, a long random string.
2. Under **Repository permissions**, set:
   - **Contents**: *Read and write*
   - **Pull requests**: *Read and write*
   - **Actions**: *Read-only*
   - **Deployments**: *Read-only*
   - **Metadata**: *Read-only*, as GitHub requires
3. Under **Subscribe to events**, tick **Push**, **Pull request**, **Pull request review**, **Pull request review comment**, **Issue comment**, **Workflow run** and **Deployment status**.
4. Set the secret on the server: `wrangler secret put SVARTZ_GITHUB_WEBHOOK_SECRET`.
5. Bind the D1 database in `wrangler.jsonc`, as for [accounts](../../docs/auth.md).

GitHub asks the owner of each installation to accept new permissions; until they do, the poll can't read runs or deployments. With `token` instead of `app`, give the token the same permissions and add a repository webhook (**Settings → Webhooks**) with the same URL, secret, content type `application/json` and events.

GitHub sends deliveries as `application/json`, which SvelteKit's CSRF check lets through, so a site needs no `csrf.trustedOrigins` for them.

### What the mirror holds

Each vault's rows are its own, keyed by the repository and the vault's folder in it:

- **Commits** on the content branch that change a file in the vault's folder, with those files. A commit's `Svartz-Account` trailer is kept as a claim and never trusted: whoever makes a commit chooses its trailer, author and committer, the App's bot address included. A commit is credited to an account only by the site's own record of the save (below).
- **Pull requests** into the content branch, with whether they change a file in the vault's folder, their **reviews**, and the **comments** on their conversation and their diff. A deleted comment stays as an empty tombstone.
- **Workflow runs** on the content branch, and **deployments** with their latest status and whether any status said it succeeded.
- Every save the site made, with who made it.

Deliveries arrive at least once and in any order, so storing one is idempotent and never moves a record backwards: a pull request keeps its latest update, a run its latest attempt and step, a deployment its latest status, and a comment stays deleted.

A delivery is refused, and nothing stored, when its `X-Hub-Signature-256` isn't the HMAC-SHA256 of its body with the webhook secret, or when it is for another repository. Events other than the seven are acknowledged and ignored, as is the App's ping.

### The poll

Webhooks get lost: a deploy was down, or a delivery failed. So when a reader asks how an edit is doing and the mirror hasn't been checked for a minute, the site asks GitHub too, after answering. Nothing polls on a timer.

The first poll backfills: the latest 100 commits touching the vault, pull requests, comments, runs and deployments. Every poll lists the same, asking with the ETag GitHub last sent, so a list that hasn't changed costs a 304. It then reads what the lists leave out (the statuses of deployments under way; the earlier statuses, read once, of a deployment a delivery showed failed or made `inactive`, where a lost `success` may hide; the statuses of each environment's newest deployment while it stands failed, since a re-run can still make it succeed; which pull requests touch the vault; their reviews, again after any review delivery; commits' files) up to 30 requests in all; the rest waits for the next poll. One poll runs at a time across every worker. When fewer than 100 of GitHub's hourly requests remain, it stops until GitHub's limit resets, keeping the rest for saves. When GitHub says to wait, it waits as GitHub asks: for `Retry-After`, until the reset when the allowance is spent, and a minute for any other rate limit. The compare requests that follow an edit wait out the same pause, and can start it; the poll and the compare requests check it before every request, so a pause one starts stops the other at once.

### Following an edit

After a save, the editor's line follows the edit while the panel is open:

| Stage | The editor says |
| --- | --- |
| Pull request open | "Opened pull request #42." |
| Closed without merging | "Pull request #42 was closed without merging." |
| Committed, or merged | "Published. It goes live once the site rebuilds.", or "Pull request #42 was merged. Your edit goes live once the site rebuilds." |
| Building | "The site is rebuilding with your edit." |
| Live | "Your edit is live." |
| Build failed | "The site's rebuild failed, so your edit isn't live yet." |

The browser remembers the last edit saved from each page, and the last new page, for 30 days. When the reader opens the editor there again, its progress shows above everything else, such as "The site is rebuilding with your last edit.", with a link to the commit or pull request, until they have seen it live or closed.

An edit is live once a run of the workflow (or a deployment to the environment) succeeded at a commit that holds the edit's commit, or its pull request's merge commit. The site never guesses that from times: a run at the edit's own commit holds it, and for any other the server asks GitHub's compare API once and remembers the answer. A deployment counts once any of its statuses said `success`, so one later made `inactive` by a newer deployment still counts; one made `inactive` without succeeding doesn't. A run that is cancelled or skipped says nothing; otherwise the newest run that holds the edit decides building or failed, and a re-run that succeeds makes it live. A success counts however many runs follow it.

Only the reader who saved an edit can ask about it: the account, or without accounts the sign-in, that saved it. A guest's edit is known by its random submission id, which only their browser holds.

### My submissions

On a site with [accounts](../../docs/auth.md) and sync, the [dashboard](../../docs/auth.md#the-dashboard) has a **My submissions** panel for every signed-in reader, at `/-/dashboard/submissions/mine/`. It lists the pull requests their saves opened: open ones first, then the rest, newest first, 20 a page. Each shows its page, whether it is in review, approved, waiting on changes, merged or closed, and how many comments it has. As on GitHub, each reviewer's latest approval or request for changes counts: an open submission waits on changes while any reviewer's does, until that reviewer approves or the review is dismissed, and is approved once a reviewer approves and none asks for changes.

Opening one shows where it stands (waiting for review, closed, merged, rebuilding, live or failed, as the editor says), then its conversation in time order: reviews, comments, and the comments on lines of the diff, each line's thread together. A long conversation shows its newest 500 comments, with the first comment of each thread they're in, and links to the pull request on GitHub for the earlier ones. Everything is read from the mirror, so the page never waits on GitHub; a mirror older than a minute is read again after the page answers. Comments show as the plain text they were written in, escaped, so nothing GitHub sends runs or renders on the site.

A submission belongs to the account that saved it, as the site recorded the save. Nothing a pull request says, its text, branch or commit trailers, makes it anyone's, and a pull request the site didn't open is nobody's. Other readers' submissions, and guests' edits, never show here.

**Replies.** Under the conversation, and under each line's thread, the reader can reply. The App posts the reply on GitHub, as a comment on the pull request or in that line's thread, starting with a header that names who wrote it:

```md
> [!NOTE]
> Sent from wiki.example by [Grace Hopper (grace)](<https://wiki.example/users/grace/>), submitter.

Added a source.
```

The header names the account's display name and handle, its role (`submitter` on their own submission; otherwise their first role, or `reviewer`), and links their [user page](../../docs/auth.md#user-pages) when this vault publishes one. A name can't break it: names lose line breaks and their Markdown is escaped. What the reader writes keeps its Markdown, but a `@name` in it doesn't notify anyone on GitHub, and a callout in it shows as a plain quote, so nothing below the header can pass for another one. The panel shows the reply as the account that wrote it, until someone edits it on GitHub. A reply is up to 4,000 characters, and the browser keeps it while it is sent, so a reply GitHub refuses is still there to send again.

**Follow-up edits.** While the pull request is open, **Edit page** opens the editor on the file as the submission's branch holds it now, and **Add to submission** commits the change to that branch, authored and committed as [direct commits](#how-a-commit-lands) are. It never overwrites: when someone pushed to the file since the editor loaded it, nothing is written and the editor says to copy the changes and reopen it. A pull request that is closed or merged, or whose branch isn't the one the site made for that submission, takes no follow-up. Follow-ups need a [GitHub App](#github-app).

The submitter may reply while they hold `submissions:own-submissions:read`, and push follow-ups while they may also still suggest edits to the page. Anyone holding `submissions:reviews:write` on the page may do both on anyone's submission. Replies and follow-ups share one [rate limit](#rate-limit) per account, separate from saves.

### Recent edits

With `sync`, the [dashboard](../../docs/auth.md#the-dashboard) gets a Submissions section with a **Recent edits** panel, at `<mount>/-/dashboard/submissions/recent-edits/`. It lists every mirrored commit that changed the vault, newest first and 25 to a page, whether the site made it or someone pushed it on GitHub. Each entry shows:

- Its summary, the commit's first line.
- How far it has got: Not live yet, Building, Live or Build failed, decided as for [an edit](#following-an-edit).
- The pages it changed, linked, and the site's attachments it changed. A commit that changed many stays one entry, with the rest folded under "N more".
- Who made it. A site account shows by name and handle only when the site's own record says so: the site committed it for that account, or it is the merge commit of a pull request the site opened for them. A commit's trailer, author and committer are chosen by whoever makes it, so they never name an account; every other commit shows its author as their GitHub user, or by their git name when GitHub links them to none.
- When, and a link to its diff on GitHub.

The panel names only what the last build published. Every other file, such as a protected, hidden or unpublished note, a file added since that build or one deleted before it, is counted ("1 file the site doesn't publish") but never named. A commit shows its summary only when every file it changed is one the site publishes; any other commit shows its short SHA in place of its summary, since the summary could name what it changed. The same holds while the poll hasn't yet read which files a backfilled commit changed.

Only viewers who hold `submissions:pull-requests:read` on the vault see the panel. It reads the mirror alone, so it answers while GitHub is down; a stale mirror is polled after the answer, as is GitHub's compare API for up to three commits a later build may hold, newest first, so a commit can turn Live on a later view. A page's deploy states come from one batched read of the mirror however many commits it shows, so a full page costs the same few D1 queries as a short one.

## Guard

Every edit and new page passes the guard before the server calls GitHub.

### Turnstile

1. Add a widget under **Turnstile** in the Cloudflare dashboard, with your site's hostname.
2. Put its site key in `guard.turnstile.siteKey`.
3. Set its secret key on the server under the name `guard.turnstile.secret.env` gives, such as `TURNSTILE_SECRET`.

```ts
submissions({
  repo: "wikiplace/wikiplace.live",
  guard: { turnstile: { siteKey: "0x4AAAAAAA…", secret: { env: "TURNSTILE_SECRET" } } },
})
```

The editor then shows the challenge above its buttons and sends its token with the edit. The standalone shell's Content Security Policy allows Cloudflare's script; a host app with its own policy adds `https://challenges.cloudflare.com` to `script-src` and `frame-src`. The server checks the token with Cloudflare before it calls GitHub, giving up after 5 seconds. An edit without a token, with a token Cloudflare refuses, or sent while Cloudflare can't be reached is refused, and the reader can retry.

### Rate limit

Each signed-in reader (see [Reader sign-in](../../docs/auth.md)) gets `limit` submissions per `period` seconds; anonymous readers share that budget per IP. Past it, the server answers 429 with `retryAfter` in seconds and a `Retry-After` header, and the editor says when to try again, such as "Try again in 10 minutes."

When the server can't see a reader's address, as behind a proxy that hides it, anonymous edits are refused with 401 `sign_in_required`: one shared budget would let one reader use it up for everyone. Such a site needs reader sign-in, and the editor offers it as when sign-in is required.

By default the count lives in the server's memory. Each Node process and each Workers isolate keeps its own count, so a site with several instances allows up to `limit` per instance, and a restart clears it.

On Cloudflare Workers, bind a [rate limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) as `SVARTZ_SUBMISSIONS_RATE_LIMIT` to count across isolates instead. Its own `limit` and `period` then apply; set `guard.rateLimit.period` to the same period, because the binding doesn't report when its window resets and `retryAfter` is that period:

```jsonc
// wrangler.jsonc
"ratelimits": [{ "name": "SVARTZ_SUBMISSIONS_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }]
```

When the binding fails, the edit answers 503 `rate_limit_unavailable`.

## Server API

The plugin answers under `<base><mount>/_svartz/submissions/`. Failures answer `{ "error": "<code>", "message": "<for the reader>" }`.

| Request | Answer |
| --- | --- |
| `GET source/?page=/guides/setup/` | `{ "markdown": "…", "sha": "…", "destination": "commit" }`: the note at the build commit, its blob SHA, and where the reader's edit would go, `"commit"`, `"pull-request"`, or `null` when they may not save it as they are. |
| `GET destination/?folder=People&title=Ada%20Lovelace` | `{ "destination": … }`, as for `source/`, for a new page. |
| `GET links/` | `{ "notes": [{ "link", "title", "slug", "path", "href", "aliases"? }], "linkResolution", "mountPath", "tagsRoute", "attachments" }`: the published notes the editor suggests after `[[` and the Split preview links to, from the build's index, with how the vault resolves and routes links. `link` is what goes between the brackets. `attachments` holds the vault paths of the attachments the site publishes, which public notes reference; a file only protected notes use stays out. |
| `POST edit/` with `{ "submissionId", "page", "markdown", "note"?, "sha"?, "turnstileToken"? }` | 201 `{ "kind": "pull-request", "url", "number", "reason"? }` of the pull request, new or opened by an earlier attempt with the same `submissionId`, or `{ "kind": "commit", "url", "sha" }` of the commit. `sha` is `source/`'s, and a save that would commit without it is refused with 400. 401 `sign_in_required` when the reader is anonymous and sign-in is required, their address isn't visible, or guests may not save; 403 `not_allowed` when their account may not, and when Turnstile is missing or refused; 429 with `retryAfter` past the rate limit; 503 when Cloudflare, the rate limiter or GitHub can't be reached. |
| `POST new/` with `{ "submissionId", "folder", "title", "markdown", "note"?, "turnstileToken"? }` | As `edit/`. Also 400 `not_a_section` or `invalid_title`, and 409 `exists` when the title is taken, with `existing` set to the clashing page's public URL unless that page is hidden. |
| `GET status/?edit=<submissionId>` | With [sync](#github-sync): `{ "stage", "pull"?: { "number", "url" }, "commit"?: { "sha", "url" } }`, where `stage` is `open`, `closed`, `committed`, `building`, `live` or `failed`. 401 `sign_in_required` when the edit was saved signed in and the reader isn't; 404 `not_found` for an edit the site has no record of, or someone else's. |
| `POST reply/` with the form fields `pull`, `thread`?, `body` | With [sync](#my-submissions): posts a reply on pull request `pull`, in the line thread whose first comment is `thread` if given, then 303 back to the submission with `?status=sent`, or `empty`, `too-long`, `rate-limited`, `thread-gone` or `github`. 403 `cross_origin` from another site; 401 when signed out; 404 `not_found` for a pull request that isn't the reader's submission. |
| `GET follow-up/source/?pull=42` | With [sync](#my-submissions): `{ "markdown", "sha", "path" }`, the submission's file on its branch now, its blob SHA, and its path in the vault. |
| `POST follow-up/` with `{ "pull", "markdown", "note"?, "sha" }` | With [sync](#my-submissions): 201 `{ "kind": "commit", "url", "sha" }` once the follow-up is on the submission's branch. 409 `changed` when the file isn't `sha` anymore, 409 `closed` for a closed or merged pull request, 403 `not_allowed`, 404 `not_found`, 429 past the rate limit. |
| `POST github/webhook/` | With [sync](#github-sync): GitHub's deliveries. 204 once stored, 202 for a delivery with nothing the mirror keeps, 401 `bad_signature`, 403 `other_repository`, 413 past 5 MB. |

`page` is the note's URL path below the deployment base, as it appears in the site's index. `folder` is a section's path inside the vault, `""` for its top level, or the user page folder when `title` is the signed-in reader's handle. `submissionId` is 32 lowercase hex digits the client picks at random and repeats on every retry of the same submission.

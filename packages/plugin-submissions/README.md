# @svartz/plugin-submissions

Readers edit a page, or write a new one, from your Svartz site, and the site opens a pull request on your GitHub repository. You review it like any other pull request: merge to accept, close to decline, push to the branch to change it.

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

1. [Register a GitHub App](https://github.com/settings/apps/new) (under an organization: its **Settings → Developer settings → GitHub Apps**). It needs no callback or webhook: untick **Webhook → Active**.
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
| `app` | none | `{ id, privateKey: { env: "NAME" }, installation? }`: open pull requests as a [GitHub App](#github-app) instead of with `token`. Set one or the other. |
| `signIn.required` | `false` | Only signed-in readers may submit. See [Sign-in](#sign-in). |
| `guard.turnstile` | none | `{ siteKey, secret: { env: "NAME" } }`: the editor shows a [Turnstile](#turnstile) challenge and the server verifies it. Skipped when sign-in is required. |
| `guard.rateLimit` | `{ limit: 10, period: 3600 }` | Submissions allowed per `period` seconds, per signed-in reader or per IP. See [Rate limit](#rate-limit). |

## What readers see

Every published Markdown note gets an **Edit** action beside Copy page. It opens a panel with the page's Markdown source, frontmatter included, and a **What changed** field. **Open pull request** submits it, and the panel links the new pull request.

### The editor

The source opens in **Live Preview**, as in Obsidian: headings, bold, italics, links, wikilinks, inline code, callouts, embeds and task checkboxes show formatted, and the line holding the cursor shows its Markdown. Clicking a task's checkbox, or pressing Space on it, ticks it. **Source** shows the raw Markdown throughout. **Split** shows the raw Markdown beside the page as the site renders it, with the theme's callouts, code blocks, images, links and embeds, and updates it a moment after the reader stops typing. Links and embeds of published notes and attachments resolve as they do on the site, an attachment found by its name included, and links to anything else show unresolved. What only the build can do stays plain: code isn't highlighted, math and diagrams show their source, and an embedded note shows its link without its body. On a phone, Split shows one side at a time under **Write** and **Preview** tabs. Clicking a link in the preview opens it in a new tab. The switch is remembered in the browser, and no mode changes a byte the reader didn't edit.

**Rich text** is for readers who don't write Markdown. The page shows formatted with no syntax anywhere, and a toolbar adds headings, bold, italics, bulleted and numbered lists, links, links to the site's pages and callouts. Bold, italic and link also answer to Ctrl+B, Ctrl+I and Ctrl+K (⌘ on a Mac). Each button writes Markdown into the same source, so switching to Live Preview or Source shows exactly what Rich text wrote. Enter continues a list or a callout, and Backspace at the start of a heading or list item turns it back into text. The frontmatter shows as a **Properties** panel above the page: each property's name and value, lists as comma-separated text, and anything more nested as its YAML. Editing a property rewrites only its own lines. What the toolbar can't write (tables, code blocks, HTML, footnotes, math, comments) shows as its Markdown, in a block of its own, and is edited as text. Rich text loads the first time a reader opens it.

Split's preview loads the first time a reader opens it, and renders in a web worker so typing never waits on it. A site's Content Security Policy allows the worker with `script-src 'self'` (or `worker-src 'self'`), as the standalone shell's does. A host app that renders notes without Svartz's runtime offers no Split.

Typing `[[` suggests the site's published notes. Arrow keys choose one, Enter inserts it as `[[Name]]`, or `[[folder/Name]]` when another note's name, slug or alias would take `[[Name]]`, and Escape closes the list. Password-protected and hidden notes are never suggested.

### Drafts

The editor saves what a reader writes in the browser's `localStorage` as they write it, per page (and one new page per vault), so a closed tab loses nothing and a crash loses at most the last moment of typing. The next time they open the editor on that page, it offers the draft back above the source with **Restore edit** and **Discard edit** (**Restore page** and **Discard page** for a new page); the fields take no writing until they choose. An edit's draft records a fingerprint of the source it was written against: if the page has changed on the site since, the offer says "This page changed since you saved this draft" and the restore button reads **Restore anyway**, since sending the draft would undo those changes. Drafts saved before fingerprints existed are offered as before. A draft is forgotten once its pull request opens, or when the reader discards it or closes the editor and confirms discarding their changes.

### New page

Every page gets a **New page** action in the site actions (the rail or site navigation). Its panel asks for a **Title** and a **Section**, then opens on a blank page with a **Why add this page** field. The sections are the vault's folders that hold a published note, plus its top level when that does. The page is saved as `<section>/<title>.md`, so the title is the note's name as in Obsidian, and its URL follows the vault's usual slug rules. A title that a page in that section already has is refused, with a link to that page.

## What maintainers get

- For an edit, a branch `svartz/submission/edit/<page>-<submission id>` from the commit the site was built from, with one commit replacing the note. When the page changed since, GitHub shows a conflict instead of the edit overwriting it. The pull request is titled `Edit <path>`.
- For a new page, a branch `svartz/submission/new/<vault folder>-<section>-<title>-<submission id>` from the same commit, with one commit adding the note. The pull request is titled `Add <path>`.
- Every pull request gets the configured labels, the reader's note, and the page or site it came from.
- A signed-in reader is named in the pull request with a link to their profile and the provider they signed in with, such as "Submitted by [Ada Lovelace](https://github.com/ada) (signed in with GitHub)". A reader signed in with GitHub also authors the commit, as their `<id>+<login>@users.noreply.github.com` address, so GitHub links it to their account. Google, Discord and X accounts have no GitHub account to link, so their commit keeps the token's owner, or the App, as author.

Each opened editor makes a random submission id and sends it with every attempt. When GitHub's answer is lost, a retry finds the pull request the first attempt opened instead of opening a second one. When GitHub refuses the pull request, the branch stays: another attempt at the same edit may be opening a pull request from it, and a retry reuses it. Every GitHub request gives up after 10 seconds, and the reader is told to try again.

Readers never choose a file path; the server works it out:

- An edit must name a published `.md` note. Password-protected notes, other files and paths outside the vault are refused.
- A new page must name a section from the list. Folders without a published note, folders holding only password-protected notes, and hidden folders are refused. So are titles that start with a dot or contain `\ / : * ? " < > | # ^ [ ]`, and titles over 120 characters.
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
| `GET source/?page=/guides/setup/` | `{ "markdown": "…" }`, the note at the build commit. |
| `GET links/` | `{ "notes": [{ "link", "title", "slug", "path", "href", "aliases"? }], "linkResolution", "mountPath", "tagsRoute", "attachments" }`: the published notes the editor suggests after `[[` and the Split preview links to, from the build's index, with how the vault resolves and routes links. `link` is what goes between the brackets. `attachments` holds the vault paths of the attachments the site publishes, which public notes reference; a file only protected notes use stays out. |
| `POST edit/` with `{ "submissionId", "page", "markdown", "note"?, "turnstileToken"? }` | 201 `{ "url", "number" }` of the pull request, new or opened by an earlier attempt with the same `submissionId`. 401 `sign_in_required` when the reader is anonymous and sign-in is required or their address isn't visible; 403 when Turnstile is missing or refused; 429 with `retryAfter` past the rate limit; 503 when Cloudflare, the rate limiter or GitHub can't be reached. |
| `POST new/` with `{ "submissionId", "folder", "title", "markdown", "note"?, "turnstileToken"? }` | As `edit/`. Also 400 `not_a_section` or `invalid_title`, and 409 `exists` when the title is taken, with `existing` set to the clashing page's public URL unless that page is hidden. |

`page` is the note's URL path below the deployment base, as it appears in the site's index. `folder` is a section's path inside the vault, `""` for its top level. `submissionId` is 32 lowercase hex digits the client picks at random and repeats on every retry of the same submission.

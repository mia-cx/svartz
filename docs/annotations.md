# Annotations

`@svartz/plugin-annotations` shows readers' comments beside the passage they respond to. Each commented passage is highlighted, with a marker in the margin on its first line that opens the comment, its author's name and avatar. Everyone sees them, signed in or not; signed-in readers select a passage and add their own, and **+1** the comments they agree with. Comments live in a Cloudflare D1 database that the plugin sets up itself.

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "notes",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [
      auth({ providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } } }),
      annotations({ database: { env: "DB" } }),
    ],
  }],
});
```

Enable it per vault. It needs [`auth`](auth.md) on the same vault, and a Cloudflare target (`cloudflare-workers`, `cloudflare-pages`, or `host` in an app on `@sveltejs/adapter-cloudflare`). A `node` target fails the build naming the plugin, because D1 is the only storage.

| Option | Value |
| --- | --- |
| `database` | The D1 binding to store annotations in: `{ env: "DB" }`. |
| `reactions` | Optional. The site's drawn reactions, `[{ id, label, src }]`, in the order readers are offered them. `id` is lowercase letters, digits and hyphens; `label` is what screen readers announce. |
| `moderators` | Optional. Identity ids, such as `"github:583231"`, that may delete any annotation. |
| `limits` | Optional. `{ writesPerHour }`: comments, reactions and agreements each signed-in reader may write per hour. Default 30. |

## The D1 database

Create a database and bind it under the name `database.env` gives:

```sh
npx wrangler d1 create notes-annotations
```

```jsonc
// wrangler.jsonc
{
  "d1_databases": [{ "binding": "DB", "database_name": "notes-annotations", "database_id": "<id from d1 create>" }]
}
```

There is nothing to migrate by hand. The first request after a deploy creates or updates the tables, and records each applied version in `svartz_annotations_migrations`. Keep staging and production on separate databases, so testing never touches real comments.

Under `svartz dev`, the plugin reads the same binding from a local D1 that Wrangler keeps in `.wrangler/state` (see [bindings under `svartz dev`](server-plugins.md#bindings-under-svartz-dev)). Inspect it with:

```sh
npx wrangler d1 execute DB --local --command "SELECT page, body FROM annotations"
```

Only a person's identity is stored: their id, provider, name, and, when the provider has them, handle, avatar and profile link. A site that stores these owes its readers a privacy notice; link it with `auth`'s `privacyNotice`.

## Showing annotations on a page

`attach` shows a page's annotations on the element that holds the note's text, and returns a function that removes them:

```ts
import { attach } from "@svartz/plugin-annotations/browser";
import "@svartz/plugin-annotations/browser.css";

const detach = attach(document.querySelector(".prose")!, {
  endpoint: "/notes/_svartz/annotations",
  page: "garden/roses",
});
```

- `endpoint` is the plugin's routes: `<base><mount>/_svartz/annotations`.
- `page` is the note's path in its vault. Annotations are stored under it, so it must stay the same for the same note.

The note's own DOM is never changed: highlights use the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API), and markers sit in a layer after the element, so they follow the note in tab order. A comment whose passage is no longer in the note is left out. Comment text is always shown as text, with web addresses made links.

Each marker is a button named for its comment, such as "Comment by Ada Lovelace on “the dew point”". Enter or a click opens the comment as a popover beside the marker, or under it when the margin is too narrow; Escape closes it and returns focus to the marker. An author without an avatar gets their initials; without a profile link, their name isn't a link.

Annotations are hidden when the page prints (everything carries `data-print-hide`) and never appear in a note's Markdown twin, which is built from the note's source.

### Commenting

Selecting text inside the element shows a toolbar above the selection with **Comment**. The selection stays an ordinary selection, so copying works, until the reader picks an action. From the keyboard, Tab moves from the selection to the toolbar and Escape leaves it. **Comment** opens a composer beside the passage: **Post comment** (or Ctrl/⌘+Enter) posts it, and **Cancel** (or Escape) goes back to the selection. A posted comment gets its highlight and marker at once, and focus moves to the marker.

A comment is plain text up to 2,000 characters, on a passage of up to 1,000. When the site refuses one, the composer keeps the draft and shows why.

A signed-out reader who posts gets `auth`'s sign-in dialog. The draft, its passage and the pending action wait in `sessionStorage`, and when sign-in brings the reader back to the page, `attach` reopens the composer on the same passage with the draft as it was. The dialog is [`auth`'s](auth.md#the-sign-in-dialog), which the `auth` plugin puts on every page of its vault.

### Agreeing

Each comment's card ends with **+1** and its count, beside the faces and names of who agrees: "You, Grace Hopper, and 2 others agree". **+1** is a toggle button, so Enter or Space adds the reader's agreement and takes it back, and screen readers hear whether it's pressed. A reader agrees with a comment once. While a **+1** saves, the button ignores presses, so the answer always matches the last one sent. Only comments take a **+1**, never reactions.

A signed-out reader who presses **+1** gets the sign-in dialog too. When they come back, the comment's card opens with their **+1** applied.

### Styling

The stylesheet follows theme-minimal's tokens (`--sv-accent`, `--sv-paper`, …) and falls back to system colours elsewhere. Set these to restyle it:

| Property | Default |
| --- | --- |
| `--sv-annotations-highlight` | The accent at 16% |
| `--sv-annotations-highlight-active` | The accent at 34%, for the passage whose comment is open |
| `--sv-annotations-marker` | The accent's text colour |
| `--sv-annotations-marker-size` | `1.75rem` |
| `--sv-annotations-card-width` | `18rem`, for comment cards and the composer |

Style the highlights directly with `::highlight(svartz-annotations)` and `::highlight(svartz-annotations-active)`.

## Routes

Under `<base><mount>/_svartz/annotations/`:

| Route | Answers |
| --- | --- |
| `GET ?page=<note path>` | `{ annotations, viewer }`: the page's comments and reactions, oldest first, each with its anchor, author and agreements, and `viewer: { id }` for the signed-in reader, or `null`. Public. |
| `POST` | Stores a comment, `{ kind: "comment", page, anchor, body }`, for the signed-in reader, and answers `201 { annotation }`. Writing also refreshes the reader's stored identity. |
| `POST <id>/agree/` | Sets the signed-in reader's **+1** on comment `<id>`: `{ agreed: true }` adds it, `{ agreed: false }` takes it back. Answers `{ agreed, agreements }`, the comment's agreements after the change, oldest first. Sending the same state again changes nothing, so a retry is safe. |

`anchor` is what `describe` returns for the selection: `{ exact, prefix, suffix, start, end }`, where `end - start` is the length of `exact`.

Failures answer `{ error, message }`, where `message` is written for the reader:

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_page` | `GET` without `page`. |
| 400 | `invalid_annotation` | An empty body or one over 2,000 characters, a quote over 1,000, or an anchor whose position doesn't cover its quote. |
| 400 | `invalid_agreement` | A **+1** without a boolean `agreed`, or on a reaction. |
| 400 | `invalid_json` | A `POST` body that isn't JSON. |
| 401 | `signed_out` | A `POST` from a reader who isn't signed in. |
| 403 | `cross_origin` | A `POST` whose `Origin` header is missing or names another site. |
| 404 | `not_found` | A **+1** on a comment that isn't in this vault, or was deleted. |
| 413 | `too_large` | A `POST` body over 32 KiB. |
| 503 | `misconfigured` | No D1 binding under `database.env`. |

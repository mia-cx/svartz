# Annotations

`@svartz/plugin-annotations` shows readers' comments beside the passage they respond to. Each commented passage is highlighted, with a marker in the margin on its first line that opens the comment, its author's name and avatar. Everyone sees them, signed in or not; signed-in readers select a passage and add their own, **+1** the comments they agree with, and delete their own; moderators delete anyone's. Comments live in a Cloudflare D1 database that the plugin sets up itself.

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
| `moderators` | Optional. Identity ids, such as `"github:583231"`, that may delete any annotation. See [moderating](#moderating) for finding yours. |
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

On a site built with theme-minimal, or any theme that extends it, enabling the plugin is all it takes: every note shows its annotations, with no code. Moving to another note removes the last note's markers, cards and highlights and shows the new note's. List pages, tag pages and password-protected notes get none, so nothing ever quotes a protected note publicly. Each note's annotations are stored under its slug, so renaming the note's file starts it without them.

A theme that doesn't extend minimal opts in by marking the note body (see [creating a theme](../vaults/docs/guides/create-theme.md#notes-and-browser-resources)).

The note's own DOM is never changed: highlights use the [CSS Custom Highlight API](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API), and markers sit in a layer after the note's body, so they follow the note in tab order. A comment whose passage is no longer in the note is left out. Comment text is always shown as text, with web addresses made links.

Each marker is a button named for its comment, such as "Comment by Ada Lovelace on “the dew point”". Enter or a click opens the comment as a popover beside the marker, or under it when the margin is too narrow; Escape closes it and returns focus to the marker. An author without an avatar gets their initials; without a profile link, their name isn't a link.

Annotations are hidden when the page prints (everything carries `data-print-hide`) and never appear in a note's Markdown twin, which is built from the note's source.

### In a host app

On a page the host app renders itself, call `attach` on the element that holds the note's text. It returns a function that removes the annotations:

```ts
import { attach } from "@svartz/plugin-annotations/browser";
import "@svartz/plugin-annotations/browser.css";

const detach = attach(document.querySelector(".prose")!, {
  endpoint: "/notes/_svartz/annotations",
  page: "garden/roses",
});
```

- `endpoint` is the plugin's routes: `<base><mount>/_svartz/annotations`.
- `page` is the key the note's annotations are stored under, so it must stay the same for the same note. Theme pages use the note's slug, such as `garden/roses`; use the same to share a note's annotations with them.

### Commenting

Selecting text in the note shows a toolbar above the selection with **Comment**. The selection stays an ordinary selection, so copying works, until the reader picks an action. From the keyboard, Tab moves from the selection to the toolbar and Escape leaves it. **Comment** opens a composer beside the passage: **Post comment** (or Ctrl/⌘+Enter) posts it, and **Cancel** (or Escape) goes back to the selection. A posted comment gets its highlight and marker at once, and focus moves to the marker.

A comment is plain text up to 2,000 characters, on a passage of up to 1,000. When the site refuses one, the composer keeps the draft and shows why.

A signed-out reader who posts gets `auth`'s sign-in dialog. The draft, its passage and the pending action wait in `sessionStorage`, and when sign-in brings the reader back to the page, the composer reopens on the same passage with the draft as it was. The dialog is [`auth`'s](auth.md#the-sign-in-dialog), which the `auth` plugin puts on every page of its vault.

### Agreeing

Each comment's card ends with **+1** and its count, beside the faces and names of who agrees: "You, Grace Hopper, and 2 others agree". **+1** is a toggle button, so Enter or Space adds the reader's agreement and takes it back, and screen readers hear whether it's pressed. A reader agrees with a comment once. While a **+1** saves, the button ignores presses, so the answer always matches the last one sent. Only comments take a **+1**, never reactions.

A signed-out reader who presses **+1** gets the sign-in dialog too. When they come back, the comment's card opens with their **+1** applied.

### Deleting

A signed-in reader's own comments end with **Delete**. It asks first, "Delete your comment?", with **Cancel** focused so a second Enter can't delete by accident; **Delete comment** deletes it and its **+1**s. The marker, card and highlight go at once, the line's other markers close up, and focus moves to the next marker. While the delete is sent, the confirmation ignores presses. When the site refuses, the card stays open and says why. A comment someone else deleted first goes too.

### Moderating

Moderators see **Delete** on every comment, and delete it from the page itself. To make yourself one, sign in on the site, open `<base><mount>/_svartz/auth/me/`, and copy its `id` into `moderators`:

```ts
annotations({ database: { env: "DB" }, moderators: ["github:583231"] }),
```

The id is the provider and its stable account number, never a username, so it survives a rename.

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
| `GET ?page=<note path>` | `{ annotations, viewer }`: the page's comments and reactions, oldest first, each with its anchor, author and agreements, and `viewer: { id, moderator }` for the signed-in reader, or `null`. Public. |
| `POST` | Stores a comment, `{ kind: "comment", page, anchor, body }`, for the signed-in reader, and answers `201 { annotation }`. Writing also refreshes the reader's stored identity. |
| `POST <id>/agree/` | Sets the signed-in reader's **+1** on comment `<id>`: `{ agreed: true }` adds it, `{ agreed: false }` takes it back. Answers `{ agreed, agreements }`, the comment's agreements after the change, oldest first. Sending the same state again changes nothing, so a retry is safe. |
| `DELETE <id>/` | Deletes annotation `<id>` and its agreements, for its author or a moderator, and answers `204`. A retry finds it gone and answers `404`. |

`anchor` is what `describe` returns for the selection: `{ exact, prefix, suffix, start, end }`, where `end - start` is the length of `exact`.

Failures answer `{ error, message }`, where `message` is written for the reader:

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_page` | `GET` without `page`. |
| 400 | `invalid_annotation` | An empty body or one over 2,000 characters, a quote over 1,000, or an anchor whose position doesn't cover its quote. |
| 400 | `invalid_agreement` | A **+1** without a boolean `agreed`, or on a reaction. |
| 400 | `invalid_json` | A write body that isn't JSON. |
| 401 | `signed_out` | A write from a reader who isn't signed in. |
| 403 | `cross_origin` | A write whose `Origin` header is missing or names another site. |
| 403 | `forbidden` | A delete by someone who neither wrote the annotation nor moderates. |
| 404 | `not_found` | A **+1** or delete on an annotation that isn't in this vault, or was deleted. |
| 413 | `too_large` | A write body over 32 KiB. |
| 503 | `misconfigured` | No D1 binding under `database.env`. |

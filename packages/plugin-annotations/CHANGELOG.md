# @svartz/plugin-annotations

## 2.4.0

### Minor Changes

- 4d4b468: Comments listed after the note, because their passage is gone, now have **+1** and **Delete** like a card. **Delete** is offered to the comment's author and to moderators, asks first, and locks while it's sent. The list's count drops as entries go, focus moves to the next entry, and the list goes with its last one. A signed-out reader's **+1** on a listed comment is applied when they come back from signing in.
- 7ed159e: Comments stay on their passage through light edits to the note: a fixed typo, an inserted word, a rewrapped sentence, or text added before it. A comment whose passage was deleted or rewritten is no longer dropped: it is listed after the note, with its author and the quote it responded to. A passage is only matched where at least 60% of its quote and surrounding text still agree, so a deleted passage never jumps to the same words elsewhere. See "Showing annotations on a page" in `docs/annotations.md`.
- 83378b5: Readers **+1** a comment they agree with. Each comment card shows **+1** with its count and the names and faces of who agrees; it's a toggle button, so Enter or Space adds or takes back the reader's agreement. The new `POST <mount>/_svartz/annotations/<id>/agree/` route takes `{ agreed: true | false }`, so a retried request changes nothing, and keeps one agreement per reader per comment. It refuses reactions. `GET` now also answers `viewer`, the signed-in reader's `{ id }` or `null`. A signed-out reader gets the sign-in dialog, and their **+1** is applied when they come back.
- 82fb5bf: Signed-in readers comment on a passage they select. Selecting text inside an attached element shows a toolbar with **Comment**, and the composer posts to the new `POST <mount>/_svartz/annotations/` route, which needs a session from `@svartz/auth` and a same-origin `Origin`. Comments are plain text up to 2,000 characters on a passage up to 1,000. A signed-out reader gets the sign-in dialog and comes back to the same passage with their draft.
- 27efd51: Readers delete their own comments, and moderators delete anyone's, from the comment's card. **Delete** asks first and locks while it's sent; the marker, card and highlight go when it's done. The new `DELETE <mount>/_svartz/annotations/<id>/` route deletes an annotation and its agreements for its author or an identity listed in `moderators`, answers 403 to anyone else, and 404 to an id that's already gone. `GET`'s `viewer` now also says whether the reader is a `moderator`.
- 0b730fe: New package: `@svartz/plugin-annotations` shows readers' comments beside the passage they respond to, to every reader, signed in or not. `annotations({ database: { env: "DB" } })` stores them in Cloudflare D1 and creates its tables on the first request; `attach(element, { endpoint, page })` highlights each passage and opens its comment from a marker in the margin.
- dafcfc9: Host apps get annotations on their own pages. `SvartzNoteContent` marks a public note's body like theme-minimal does, so the vault's annotations show on it with no code. On markup the host renders itself, `attach(element, { vault, slug })` takes a vault from `virtual:svartz/host` and the note's slug, and finds the routes under the deployment base and mount itself. See "Annotations" in `docs/host-vaults.md`.
- 9d8dbee: A theme-minimal site shows annotations on every note once it enables `auth` and `annotations`, with no code, and so does every theme that extends minimal. theme-minimal marks each note's body with `data-svartz-note="<slug>"`; the plugin's browser script attaches there after each navigation, keyed by the slug, and detaches when the reader leaves. List pages and password-protected notes get none.

### Patch Changes

- d951fff: Limit each signed-in reader's annotation writes, including comments, +1 and deletes, to `limits.writesPerHour` per clock hour, counted in the annotations database so every isolate shares the budget. Refusals say when to try again and keep comment drafts.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [23bd2dd]
- Updated dependencies [fe00cef]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
- Updated dependencies [626d6f1]
- Updated dependencies [832fc32]
- Updated dependencies [ae978d6]
  - @svartz/core@2.4.0
  - @svartz/auth@2.4.0

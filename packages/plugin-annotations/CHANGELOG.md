# @svartz/plugin-annotations

## 2.5.0

### Minor Changes

- 3c812b2: `findComments(env, database, vault, ids)` from `@svartz/plugin-annotations/server` reads many comments in one D1 query, by id, so a list of reports about comments costs the same however long it is.
- bfa472d: Moderators can hide a comment. `POST <mount>/_svartz/annotations/<id>/hide/`, a form post, hides it for whoever holds `annotations:comments:delete` on its page, records it in auth's audit log in the same transaction, and redirects to the form's `returnTo`. Hiding needs annotations to keep its comments in the accounts database, `database: { env: "SVARTZ_DB" }`; with any other binding the route answers 503 `misconfigured`. A hidden comment stays stored, so a report about it can still show it, but no list shows it and nobody can +1 it. On a vault with `@svartz/plugin-moderation`, other people's comments offer **Report**, and the moderation plugin reads a reported comment with `findComment` from `@svartz/plugin-annotations/server`.
- 8c57dcf: On a site with accounts, a **+1** on a comment adds to the reputation of its author's account, and taking the **+1** back takes the points back. A person's **+1** counts once however many of their sign-ins agree, and nobody earns from agreeing with their own comment.
- a863185: Plugins can declare permissions and check them with one call. A plugin lists what it checks under `permissions`, as `namespace:feature:action` slugs with a name, a description and optional defaults for the built-in actors `guest` (everyone) and `signed-in` (everyone with an account). Auth collects the declarations at build time, a theme preset's plugins included, and fails the build on a malformed one. Build hooks can read every plugin the build runs as `ctx.plugins`.

  `can(account, permission, object, env)` from `@svartz/auth/server` answers whether an account, or a guest, holds a permission on the site, a vault or a page. Grants live in `SVARTZ_DB` and give an actor `allow`, `deny` or `unset` on an object: the most specific object with a grant that applies decides, then the most specific actor, and a deny beats an allow between equals. Admins are allowed everything, and every account everything on its own `users/<handle>` page. Without `SVARTZ_DB`, `can()` answers `false`.

  Annotations now declares `annotations:comments:write`, which every signed-in reader holds by default, and `annotations:comments:delete`, which lets a reader delete anyone's annotations on a page. On a site with accounts, each identity in the `moderators` option becomes a grant of `annotations:comments:delete` on the vault once its owner has an account, and the grant decides from then on. `moderators` is deprecated; grant the permission instead. Sites without `SVARTZ_DB` keep using the list.

- 3aac18d: An account's reputation now shows beside its name wherever the site names it, the way rep shows on Stack Exchange: a compact number such as `1,234`, or `12.5K` past ten thousand, read in full by screen readers and in its tooltip.
  - `@svartz/auth`: every public profile (`findProfile`, `findProfiles`, `findProfilesByHandle`, `findProfilesByIdentity`) carries `reputation`, from the same query. Render it with `reputationBadgeHtml(score)` from the new `@svartz/auth/badge` entry, or `reputationBadge(score)` from `@svartz/auth/browser`; its style is in `@svartz/auth/browser.css`.
  - `@svartz/plugin-annotations`: the page's list gives each comment the `reputation` of the account its author's sign-in is linked to, and the comment card shows it beside the author's name.

### Patch Changes

- Updated dependencies [03747e2]
- Updated dependencies [7f28eb7]
- Updated dependencies [8677494]
- Updated dependencies [22acec7]
- Updated dependencies [34fe812]
- Updated dependencies [c2b0f0d]
- Updated dependencies [11aedab]
- Updated dependencies [7119bad]
- Updated dependencies [142f796]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [b82cf41]
- Updated dependencies [f6cf60e]
- Updated dependencies [e42d690]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
- Updated dependencies [3aac18d]
- Updated dependencies [8c57dcf]
- Updated dependencies [2c11831]
  - @svartz/auth@2.5.0
  - @svartz/core@2.5.0

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
- Updated dependencies [6172acb]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
- Updated dependencies [626d6f1]
- Updated dependencies [832fc32]
- Updated dependencies [ae978d6]
  - @svartz/core@2.4.0
  - @svartz/auth@2.4.0

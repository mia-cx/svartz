---
"@svartz/auth": minor
---

Every account has a user page: the note at `users/<handle>` in the vault that runs sign-in, on which its account holds every permission whatever the grants say. In a host app with several vaults, that is the callback vault; the same path in another vault is an ordinary page. The new `userPages` option names another folder, such as `auth({ providers, userPages: "people" })`; host vaults must set the same one. The override covers the page itself, not pages below it.

A user page stays its owner's after a handle change: it keeps its address, and the override follows every handle the account has held, which no other account can take. A handle whose user page already exists is taken unless the account held it before, so nobody gains a page someone else wrote by choosing its handle.

The account page links the reader's user page as **Your page**. While they have none, the account page of the vault that holds user pages leaves an empty `data-svartz-region="user-page-actions"` element beside their name for a plugin that writes pages to fill; `@svartz/plugin-submissions` puts **Create your page** there. Plugins read where user pages live with `userPageLocation()` from `@svartz/auth/server`. In a host app, the account page's profile form posts to the callback vault, which checks the new handle against its user pages, and returns to the account page it came from.

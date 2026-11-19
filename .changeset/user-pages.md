---
"@svartz/auth": minor
---

Every account has a user page: the note at `users/<handle>` in each vault, on which its account holds every permission whatever the grants say. The new `userPages` option names another folder, such as `auth({ providers, userPages: "people" })`; host vaults must set the same one. The override covers the page itself, not pages below it.

A user page stays its owner's after a handle change: it keeps its address, and the override follows every handle the account has held, which no other account can take. A handle whose user page already exists is taken unless the account held it before, so nobody gains a page someone else wrote by choosing its handle.

The account page links the reader's user page as **Your page**. While they have none, it leaves an empty `data-svartz-region="user-page-actions"` element beside their name for a plugin that writes pages to fill; `@svartz/plugin-submissions` puts **Create your page** there. Plugins read the folder with `userPageFolder()` from `@svartz/auth/server`.

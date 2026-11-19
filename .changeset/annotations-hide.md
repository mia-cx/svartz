---
"@svartz/plugin-annotations": minor
---

Moderators can hide a comment. `POST <mount>/_svartz/annotations/<id>/hide/`, a form post, hides it for whoever holds `annotations:comments:delete` on its page, records it in auth's audit log in the same transaction, and redirects to the form's `returnTo`. Hiding needs annotations to keep its comments in the accounts database, `database: { env: "SVARTZ_DB" }`; with any other binding the route answers 503 `misconfigured`. A hidden comment stays stored, so a report about it can still show it, but no list shows it and nobody can +1 it. On a vault with `@svartz/plugin-moderation`, other people's comments offer **Report**, and the moderation plugin reads a reported comment with `findComment` from `@svartz/plugin-annotations/server`.

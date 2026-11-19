---
"@svartz/plugin-annotations": minor
---

Moderators can hide a comment. `POST <mount>/_svartz/annotations/<id>/hide/`, a form post, hides it for whoever holds `annotations:comments:delete` on its page, records it in auth's audit log, and redirects to the form's `returnTo`. A hidden comment stays stored, so a report about it can still show it, but no list shows it and nobody can +1 it. On a vault with `@svartz/plugin-moderation`, other people's comments offer **Report**, and the moderation plugin reads a reported comment with `findComment` from `@svartz/plugin-annotations/server`.

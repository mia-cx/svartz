---
"@svartz/plugins": minor
"@svartz/auth": patch
---

A note named exactly after its folder is that folder's note, as with Obsidian's folder notes: `Guides/Guides.md` publishes at `/guides/`, names and introduces the `Guides` listing, and can't set `slug`, as `Guides/index.md` and `Guides/_index.md` do. Wikilinks to `[[Guides]]` still find it, and the `closest` and `shallowest` link strategies rank notes by where their files sit, not by their URLs.

An account can no longer take the user page folder's own name as its handle (`users` by default), since `users/users.md` is that folder's note rather than a user page. The handle chooser offers `users-2` instead.

---
"@svartz/plugins": minor
"@svartz/auth": patch
---

A note named exactly after its folder is that folder's note, as with Obsidian's folder notes: `Guides/Guides.md` publishes at `/guides/`, names and introduces the `Guides` listing, and can't set `slug`, as `Guides/index.md` and `Guides/_index.md` do. Wikilinks to `[[Guides]]` still find it, and the `closest` and `shallowest` link strategies rank notes by where their files sit, not by their URLs.

A note named after its folder that sets `slug` now fails the build, as other folder notes do: `Guides/Guides.md` with `slug: overview` used to publish at `/guides/overview/`. Before upgrading, remove its `slug`. If the old URL must keep working, add it as an alias: `aliases: [guides/overview]`.

An account can no longer take the user page folder's own name as its handle (`users` by default), since `users/users.md` is that folder's note rather than a user page. The handle chooser offers `users-2` instead.

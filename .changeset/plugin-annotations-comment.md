---
'@svartz/plugin-annotations': minor
---

Signed-in readers comment on a passage they select. Selecting text inside an attached element shows a toolbar with **Comment**, and the composer posts to the new `POST <mount>/_svartz/annotations/` route, which needs a session from `@svartz/auth` and a same-origin `Origin`. Comments are plain text up to 2,000 characters on a passage up to 1,000. A signed-out reader gets the sign-in dialog and comes back to the same passage with their draft.

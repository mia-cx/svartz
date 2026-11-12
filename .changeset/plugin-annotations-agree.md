---
'@svartz/plugin-annotations': minor
---

Readers **+1** a comment they agree with. Each comment card shows **+1** with its count and the names and faces of who agrees; it's a toggle button, so Enter or Space adds or takes back the reader's agreement. The new `POST <mount>/_svartz/annotations/<id>/agree/` route takes `{ agreed: true | false }`, so a retried request changes nothing, and keeps one agreement per reader per comment. It refuses reactions. `GET` now also answers `viewer`, the signed-in reader's `{ id }` or `null`. A signed-out reader gets the sign-in dialog, and their **+1** is applied when they come back.

---
"@svartz/plugin-annotations": patch
---

Limit each signed-in reader's annotation writes, including comments, +1 and deletes, to `limits.writesPerHour` per clock hour, counted in the annotations database so every isolate shares the budget. Refusals say when to try again and keep comment drafts.

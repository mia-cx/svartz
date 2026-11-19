---
"@svartz/auth": minor
---

`auditIfChanged(db, entry)` from `@svartz/auth/server` is the statement that appends `entry` to the audit log only when the statement before it in the same batch changed a row. A plugin whose change keeps its rows in `SVARTZ_DB` batches the two, so a change its own guard leaves undone, such as hiding a comment already hidden, records nothing.

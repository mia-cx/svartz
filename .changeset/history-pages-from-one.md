---
"@svartz/plugin-history": patch
"@svartz/plugin-submissions": patch
---

A page's history numbers its pages from 1, as GitHub does: `?page=1` is the first page, the same as no `?page`, and `?page=10` the last, which reaches the latest 1,000 changes. `?page=0` now answers 404. `CommitReader.history` takes GitHub's page number as it is, counting from 1.

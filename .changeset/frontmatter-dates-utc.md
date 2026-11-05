---
'@svartz/plugins': patch
---

A frontmatter date without an offset is read as UTC, so `created_at: 2023-09-08T00:00` is 8 September on every build machine rather than 7 September on one east of UTC.

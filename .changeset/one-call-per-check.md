---
"@svartz/auth": patch
---

A permission check reads its grants and the account's groups in one D1 call. It made two, which pushed a dashboard view with several panels toward the 50 queries a free Worker gets per request.

---
"@svartz/auth": patch
---

The dashboard checks every panel's permission in one D1 call. It made one call per panel, so each panel a plugin added cost every dashboard view another query of the 50 a free Worker gets per request.

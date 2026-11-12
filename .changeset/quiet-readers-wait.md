---
"@svartz/plugin-annotations": patch
---

Limit each signed-in reader's annotation write attempts, including comments, +1 and deletes. Use the native Cloudflare rate-limiting binding when configured, or an hourly window per server instance. Refusals show a retry message while keeping comment drafts.

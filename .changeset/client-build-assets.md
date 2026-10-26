---
"@svartz/vite": patch
"svartz": patch
---

Attachments, feeds, and other generated files now reach SvelteKit's client output before prerendering, so a page that links one no longer fails the build with a 404.

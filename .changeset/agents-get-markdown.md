---
'@svartz/core': patch
'@svartz/vite': patch
'svartz': patch
---

Serve emitted Markdown at page URLs for requests that prefer text/markdown and known AI agents. Standalone Node and Cloudflare adapters negotiate ahead of static serving through the shared Svartz router, while static builds retain their Markdown copies and alternate links.

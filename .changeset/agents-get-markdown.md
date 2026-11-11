---
'@svartz/core': patch
'@svartz/vite': patch
'svartz': patch
---

Send requests for a page URL that prefer text/markdown, and known AI agents, to the page's emitted Markdown copy with a 303 redirect, so the copy's relative links resolve. Standalone Node and Cloudflare adapters negotiate ahead of static serving through the shared Svartz router, including percent-encoded and slashless page URLs, while static builds retain their Markdown copies and alternate links.

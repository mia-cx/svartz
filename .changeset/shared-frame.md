---
"@svartz/ui": patch
"@svartz/theme-minimal": patch
"@svartz/theme-docs": patch
"@svartz/theme-wiki": patch
---

Every first-party theme with sidebars (minimal, docs, wiki, API and MCP docs) shares one frame: at most `--sv-frame-width` (92rem) wide, `--sv-side-width` (16rem) sidebars, and Quartz's breakpoints. At 75rem a right column moves under the page, and at 50rem the explorer becomes a drawer. Docs' contents column grows from 13rem to 16rem, wiki's sidebar from 14rem to 16rem, and API docs narrow from 100rem to 92rem.

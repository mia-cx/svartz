---
"@svartz/plugins": minor
"@svartz/config": minor
"@svartz/core": minor
"@svartz/ui": minor
"@svartz/theme-minimal": minor
"@svartz/theme-wiki": minor
"@svartz/theme-blog": minor
"@svartz/theme-docs": minor
"@svartz/theme-api-docs": minor
---

Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.

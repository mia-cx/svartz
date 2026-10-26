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
"svartz": minor
---

Every public page now has a Markdown copy for LLM agents at `<page>.md`, and each vault lists them in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. `markdownForAgents` from `@svartz/ui/agent-markdown` serves the copy to AI agents and to requests that prefer `text/markdown`, and `svartz init` installs it in hosts without server hooks. Turn it off with `discovery.llms.enabled: false`.

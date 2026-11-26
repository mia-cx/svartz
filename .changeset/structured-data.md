---
"@svartz/core": minor
"@svartz/ui": minor
"@svartz/theme-minimal": minor
"@svartz/theme-docs": minor
"@svartz/theme-blog": minor
"@svartz/theme-wiki": minor
---

Every page describes itself in JSON-LD when the vault sets `site.url`. Each page carries the site's `WebSite`, a note adds its `Article` (title, description, dates, URL, `site.author` and social image), and a page that shows breadcrumbs adds its `BreadcrumbList`. The docs theme publishes guides as `TechArticle` and symbol pages as `APIReference`; the API and MCP docs themes publish operations, tools and schemas as `APIReference`; the blog publishes posts as `BlogPosting`, described by the post's `excerpt` and by its own `author` when it names them. The blog and the wiki show no breadcrumbs, so they publish none. `<` is escaped in the script, so note text can't close it.

A theme maps its own page kinds with `structuredData`: on a theme-minimal extension it maps the article of each note the theme renders, and learns which renderer claimed it. The new `chrome.breadcrumbs` flag hides minimal's breadcrumbs and their structured data together.

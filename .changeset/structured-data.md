---
"@svartz/core": minor
"@svartz/ui": minor
"@svartz/theme-minimal": minor
"@svartz/theme-docs": minor
"@svartz/theme-blog": minor
---

Every page describes itself in JSON-LD when the vault sets `site.url`. Each page carries the site's `WebSite`, a note adds its `Article` (title, description, dates, URL, `site.author` and social image), and a note or folder page adds the `BreadcrumbList` it shows. The docs theme publishes guides as `TechArticle` and symbol pages as `APIReference`; the API and MCP docs themes publish operations, tools and schemas as `APIReference`; the blog publishes posts as `BlogPosting`, by the post's own `author` when it names one, without breadcrumbs. `<` is escaped in the script, so note text can't close it.

A theme maps its own page kinds with `structuredData` on its manifest, or on a theme-minimal extension, where it also learns which renderer claimed the note.

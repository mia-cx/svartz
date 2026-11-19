---
"@svartz/plugins": minor
---

`@svartz/plugins/routes` exports `extractFrontmatter`, the parser the build reads frontmatter with, and `alternateRoutes(frontmatter, aliasesField)`, the routes a note's aliases ask to redirect from. A server can now work out every route a note's Markdown claims before it writes the note. `requestedSlug` accepts any object with a `path` and `frontmatter`.

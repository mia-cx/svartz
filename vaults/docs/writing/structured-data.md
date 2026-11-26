---
title: "Structured data"
description: "Tell search engines and agents what each page is, who wrote it, and where it sits."
---

With `site.url` set, every page carries one JSON-LD script in its head, built from what the page already shows. Nothing to configure.

| Page | Describes |
| --- | --- |
| Every page | `WebSite`: the site's title, description and home URL. |
| A note | `Article`: its title as `headline`, description, publication and modification dates, URL, `site.author` as `author`, and its social image. |
| A page with breadcrumbs | `BreadcrumbList`: the trail the page shows, from Home down to the page. |

Themes describe their own kinds of page:

| Theme | Page | Type |
| --- | --- | --- |
| [[themes/docs\|Docs]] | A guide | `TechArticle` |
| Docs | A symbol's page | `APIReference` |
| [[themes/api-docs\|API docs]], [[themes/mcp-docs\|MCP docs]] | An operation, tool or schema | `APIReference` |
| API docs, MCP docs | A guide | `TechArticle` |
| [[themes/blog\|Blog]] | A post | `BlogPosting`, described by its `excerpt` and by the post's own `author` when it names them |

The blog and the wiki show no breadcrumbs, so their pages publish none. A page's structured data describes only what a reader sees on it. Svartz adds no `FAQPage`: Google no longer shows FAQ rich results. Check a page with Google's [Rich Results Test](https://search.google.com/test/rich-results).

## In your own theme

An extension maps the article of each note it renders through `structuredData`. It gets the `Article` node and the page, with the renderer that claimed it, and returns the node to publish:

```ts
export const extensions: ThemeExtension[] = [{
  id: "@example/theme-recipes",
  renderers: [recipeRenderer],
  // A recipe page is a Recipe; the theme's other notes stay articles.
  structuredData: (article, { renderer }) => (renderer ? { ...article, "@type": "Recipe" } : article),
}];
```

Plain notes go to the primary theme's mapping, and a note that names another theme with `theme:` goes to that theme's. Breadcrumbs belong to the shell: the primary theme's `chrome.breadcrumbs` hides them on the page and in its structured data. Set it to `false` when your theme replaces the page head with one that shows no trail.

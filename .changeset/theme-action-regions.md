---
'@svartz/ui': minor
'@svartz/theme-minimal': minor
'@svartz/theme-wiki': minor
'@svartz/theme-blog': minor
'@svartz/theme-docs': minor
---

Plugins can add actions to every page. Each note's page actions end with a page-actions region (`[data-svartz-region="page-actions"]`), and every page has a site-actions region (`[data-svartz-region="site-actions"]`) in the rail or site navigation, inside the phone drawer on narrow screens. A plugin's browser script mounts links or buttons there and removes them in its cleanup; empty regions take no space. The wiki shows page actions beside the article title and site actions under Random page. Theme authors place the new `SiteActions` component from `@svartz/ui`, and `PageActions` now renders on notes without a Markdown copy.

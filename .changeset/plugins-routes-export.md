---
'@svartz/plugins': minor
---

`@svartz/plugins/routes` exports how `core:allocate-routes` derives a note's route: `pathRoute(path)`, `requestedSlug(file)`, `routeHref(slug, mountPath)` and `isNote(file)`. Code that must predict a route, such as a server refusing a new note that would take an existing page's URL, can import it. It has no dependencies, so server bundles can import it too.

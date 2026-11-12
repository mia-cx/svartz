---
title: Routes
---

# Route Keys

How `core:allocate-routes` derives the route a note asks for, for code that must predict one. The module has no dependencies, so server bundles can import it.

**Source:** `@svartz/plugins/routes`

| Export | Returns |
| --- | --- |
| `pathRoute(path)` | The route a note's filename asks for: `people/Ada Lovelace.md` → `people/ada-lovelace`. |
| `requestedSlug(file)` | The route a note asks for: its frontmatter `slug` in its folder, else `pathRoute(file.path)`. |
| `routeHref(slug, mountPath)` | A route's URL path: `routeHref("people/ada-lovelace", "/wiki")` → `/wiki/people/ada-lovelace/`. |
| `isNote(file)` | Whether `allocateRoutes` routes the file (`.md`, `.mdx`, `.svx`). |

When several notes ask for the same route, the one with an explicit `slug` gets it, then the one whose path already equals it, then the first by path. The rest move to `-2`, `-3` and so on. A new note that asks for a route another note holds or asks for can therefore take that note's URL.

```typescript
import { pathRoute } from "@svartz/plugins/routes";

pathRoute("people/ada-lovelace.md"); // "people/ada-lovelace", the same route as "people/Ada Lovelace.md"
```

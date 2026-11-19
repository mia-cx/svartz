---
"@svartz/core": minor
---

Server plugins can add panels to the site's dashboard. A server factory returns `dashboard: { title, panels }` beside `handle` and `page`, each panel with an `id`, a `title`, the `permission` that opens it and a `render` function that answers like a page renderer. The panel renders at `<mount>/-/dashboard/<plugin id>/<panel id>/` in the plugin's own context, so its forms post to the plugin's routes. Server code lists every panel on the vault with `context.dashboard()`. `@svartz/auth` serves the dashboard and decides who sees each panel.

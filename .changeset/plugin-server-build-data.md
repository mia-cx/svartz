---
'@svartz/core': minor
'@svartz/vite': minor
---

A plugin's hooks can hand its server module JSON that only the build knows, such as the notes it published: set it with `getCompilerContributions(ctx).serverData.set(id, data)` and the server factory receives it as its second argument, in the server bundle only. Browser scripts' `mount(pathname, options, context)` now gets `context.base`, the deployment base path, so a script can call its plugin's server at `<base><mount>/_svartz/<id>/`. See `docs/server-plugins.md`.

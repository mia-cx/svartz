---
title: "Create a plugin"
description: "Add a build hook or contribute a browser resource."
---

Pick the stage that owns your change. This plugin appends a build log message without altering the notes:

```ts
import { definePlugin } from "@svartz/core";

export const reportPages = definePlugin(() => ({
  id: "example:report-pages",
  buildEnd(ctx) {
    console.log(`Published ${ctx.index?.entries.length ?? 0} notes`);
  },
}));
```

Add `reportPages()` to a vault's `plugins`. For an installable plugin, export the factory from your package and declare `@svartz/core` as a peer dependency. Put option values that affect output in `options` and extra input files in `reads`, so [[writing/post-versions|Git versions]] recompile when they change.

For a Markdown compiler feature, add a remark or rehype step using `getCompilerContributions(ctx)`. For a browser resource, register an import the site can resolve. For example, add this in a hook after importing `getCompilerContributions` from `@svartz/core`:

```ts
getCompilerContributions(ctx).browserResources.set("example:styles", {
  id: "example:styles",
  kind: "css",
  importId: "@example/plugin/styles.css",
});
```

Use `kind: "script"` for a browser module that exports `mount(pathname, options, context)` and can return a cleanup function. Keep contributions scoped to the build.

## Add actions to every page

First-party themes expose `[data-svartz-region="page-actions"]` in note headers and `[data-svartz-region="site-actions"]` in the navigation. In `mount`, add a labeled link or button as a direct child where the region exists. In cleanup, remove it and its listeners. Mount runs again after navigation or after locking or unlocking a note changes the page.

The note body has `data-svartz-note` with the note slug. In a custom host rendering more than one `SvartzNoteContent`, use the `context.note` element when supplied. Append UI after the body rather than replacing its DOM. To render HTML with the active theme's content components, use `context.mountContent?.(element)`, call `render(html)`, and call `destroy()` in cleanup. Set the `sv-prose` class on the container for prose styles.

Test a hook with `runStages` and a focused `PluginContext`. For compiler changes, check the resulting artifact so `.md` and `.mdx` keep authored Svelte inert while `.svx` executes it. See the [[reference/plugin-contract|plugin contract]] for hook ordering or [[plugins/server-plugins|Server plugins]] for requests and pages.

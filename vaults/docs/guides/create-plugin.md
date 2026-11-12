---
title: Create Plugin
tags: [guides]
---

# Create a plugin

Choose the specific hook that owns your change. The [[contracts/plugin-contract]] lists all hooks and their order. Content transforms run serially; earlier hooks can prepare files for later hooks.

```ts
import { definePlugin } from "@svartz/core";

/** Remove a custom Markdown marker before compilation. */
export const stripMarker = definePlugin(() => ({
  id: "mine:strip-marker",
  transformOfm: {
    run(ctx) {
      for (const file of ctx.files) {
        file.content = file.content.replaceAll("%%marker%%", "");
      }
    },
    options: { enforce: "post", fatal: true },
  },
}));
```

Add `stripMarker()` to `defaults.plugins` for every vault or to one vault's `plugins` array. Use a unique ID. A more specific config entry with the same ID replaces it without changing its position. To remove an optional built-in, add `{ id: "core:transform-syntax", disabled: true }`.

If your feature changes Markdown parsing, use `getCompilerContributions(ctx)` instead of rewriting source text. Add remark or rehype plugins to its arrays. Put browser imports into `browserResources` with stable IDs and a `kind` of `css`, `script`, or `asset`. The Vite artifact module imports active resources and exports URLs for assets. This state belongs to one build; never keep it in a module-level variable.

## Add actions to every page

Every first-party theme renders two action regions. A browser script fills them with plain links and buttons, and the theme styles them:

| Region | Selector | Where | Present on |
| --- | --- | --- | --- |
| Page actions | `[data-svartz-region="page-actions"]` | The note header, after Copy page and View as Markdown | Notes |
| Site actions | `[data-svartz-region="site-actions"]` | The rail or site navigation; the menu drawer on phones | Every page |

Svartz calls `mount(pathname)` after each navigation has rendered, and again after unlocking or locking a password-protected note changes the page, so the regions for that page are already in the document. Look them up there, never at import time, and skip a region the page lacks: list pages have no page actions, and a host app's own pages have neither. Return a cleanup that removes what you added and every listener you attached. The next page mounts afresh.

```ts
/** Edit on every note, New page on every page. */
export function mount(pathname: string) {
  const button = (label: string, onclick: () => void) =>
    Object.assign(document.createElement("button"), { type: "button", textContent: label, onclick });
  const edit = button("Edit", () => openEditor(pathname));
  const create = button("New page", () => openEditor());
  document.querySelector('[data-svartz-region="page-actions"]')?.append(edit);
  document.querySelector('[data-svartz-region="site-actions"]')?.append(create);
  return () => {
    edit.remove();
    create.remove();
  };
}
```

Mount `<a>` or `<button>` elements as direct children of the region. Each needs a visible label or an `aria-label`. An empty region takes no space.

To work on the note itself, such as highlighting passages, look up `[data-svartz-note]`. Every first-party theme puts it on the element that holds the note's body, with the note's slug as its value: `<article data-svartz-note="garden/roses">`. Leave that element's DOM as it is, since the theme renders it. List pages and password-protected notes have no marked body.

A host app can render several notes on one page with `SvartzNoteContent`, each mounting your script with its own body as `context.note`. Work on that element when it is set, and look up `[data-svartz-note]` in the document only when it is absent: `context.note ?? document.querySelector("[data-svartz-note]")`.

`mount` also receives the resource's `options` and a `context` whose `base` is the deployment base path (`""` at the domain root). `pathname` includes it. Build URLs from it, such as `${context.base}${mountPath}/_svartz/<id>/` for a plugin's own server.

To show Markdown as the page shows notes, render it to HTML and pass it to `context.mountContent(element)`. Its `render(html)` draws the HTML in `element` through the page's content components (the host's overrides, then the theme's callout, code block, image, link and embed) and drops scripts, event handlers and `javascript:` URLs, as the build does. Give `element` the `sv-prose` class for the theme's prose styles. Each `render` replaces what shows, keeping the blocks it didn't change; call `destroy()` in your cleanup. The renderer loads on first use, and `mountContent` is absent where the page renders no vault content. `@svartz/plugins/preview` renders a note's Markdown to that HTML in the browser, as the submissions editor's Split mode does.

## Test

Test the hook with `runStages` from `@svartz/core` and a small `PluginContext`. For compiler features, also test the generated `.svelte` artifact. `.md` and `.mdx` must keep authored Svelte inert; `.svx` may execute it. Check the disabled and same-ID replacement cases so they do not leave compiler steps or browser resources behind.

See [[plugins/overview]] for the built-in plugins.

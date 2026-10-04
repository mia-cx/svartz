# Create a theme

A Svartz theme supplies SvelteKit layouts, route pages, and optional content components. The five first-party themes in `themes/` are working examples: `minimal`, `wiki`, `blog`, `docs`, and `api-docs`. Visual styles belong to the theme; note parsing belongs to plugins.

## Manifest

Export a `defineTheme` factory from the package root. `@svartz/vite` loads this Node-safe entry during config validation. It must not eagerly import `.svelte` files that Node cannot load.

```ts
// src/lib/index.ts
import { defineTheme } from '@svartz/core';

export default defineTheme({
  id: '@example/theme',
  version: '1.0.0',
  contractVersion: '1.0.0',
  layouts: {
    defaultPage: () => import('./SiteLayout.svelte'),
    notePage: () => import('./SiteLayout.svelte')
  },
  routes: [
    { id: 'home', pattern: '/', layoutSlot: 'notePage' },
    { id: 'note', pattern: '/:slug', layoutSlot: 'notePage' }
  ],
  components: {
    callout: () => import('./Callout.svelte')
  },
  capabilities: { callouts: true, codeBlocks: true }
});
```

`defaultPage` and `notePage` are required. The `note` route must contain `:slug`. Other routes can use `component` and `layoutSlot`. Component references may be `{ default: Component }` or `() => import('./Component.svelte')`. Svartz loads lazy references before SSR and hydration. An import without a default component fails with the theme ID and slot.

`components` holds shared theme components and the five content slots: `callout`, `codeBlock`, `image`, `link`, and `embed`. A host app can override those five content slots. Host wins, then theme, then the built-in HTML renderer. Layouts and route pages remain theme-owned. Content components receive typed `ContentComponentProps` from `@svartz/ui/runtime`, including `tag`, `attributes`, `text`, slot-specific fields, and a Svelte 5 `children` snippet. Render `{@render children?.()}` to keep nested links and images overridable. The `codeBlock` slot wraps a whole element: a highlighted `<figure>` arrives as `tag: "figure"` with its contents in `children`, and a bare `<pre>` arrives as `tag: "pre"` with the `<pre>` itself in `children`, so Svelte keeps the code's whitespace. Render `children` inside your wrapper; don't recreate the `<pre>`.

## Runtime entry

Publish a `./runtime` export that Vite can bundle in SvelteKit. It can share the manifest factory and use eager or lazy Svelte modules. The package root and runtime entry may differ in how they import Svelte files. See `themes/minimal/src/lib/index.ts` and `themes/minimal/src/lib/runtime.ts`.

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./runtime": "./dist/runtime.js"
  },
  "peerDependencies": { "svelte": "^5.0.0" }
}
```

Configure the theme for a vault with `theme: { base: '@example/theme' }`. `base` can also be a path resolved from the config directory. Theme options beside `base` pass to a factory manifest.

## Build on @svartz/ui

`@svartz/ui` renders Obsidian Markdown the same way in every first-party theme. A new theme can use it and write only layout:

- Import `@svartz/ui/base.css` and `@svartz/ui/prose.css` in the layout, and wrap the note body in `.sv-prose`.
- Spread `svartzContentComponents` into `components` in `runtime.ts` for callouts, code blocks, links, and embeds.
- Pass `svartzSyntax()` from `@svartz/ui/syntax` in `pluginPreset` from `index.ts` only. It replaces `core:transform-syntax` with the Svartz code colours and pulls rehype, so it stays out of browser code.
- Type layouts and pages with `ThemePageProps`. `vault` carries the index, tags, folders, and search documents with deployment URLs.

Themes can only use the routes the pipeline builds: notes, `/tags`, `/tags/:slug`, `/folders`, `/folders/:slug`, `/feed`, and `/`. Read the prefixes from `theme.routes` in the vault config, as the pipeline does. A folder note (`guides/index.md`) publishes as `guides`, the same slug as its folder.

## Notes and browser resources

Markdown `.md` and `.mdx` files compile to inert content. Write a `.svx` note when it needs authored Svelte markup or imports. Theme components can style either format, but Markdown itself never executes Svelte expressions.

Content plugins contribute remark or rehype steps and optional CSS, assets, or browser scripts. Browser script modules export `mount(pathname)` and may return a cleanup function. Svartz calls cleanup on navigation, vault changes, and unmount. Do not attach global listeners at module import time.

## Best practices

Keep layouts and route pages in the theme. Use content components for the five Markdown slots. Keep custom note logic in `.svx` files. Test both SSR output and navigation when a theme adds browser scripts. Make every page in `runtime.ts` eager: a lazy page that shares modules with eager ones stalls the Vite build (#62).

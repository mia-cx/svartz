# Create a theme

A Svartz theme supplies SvelteKit layouts, route pages, and optional content components. Use `themes/minimal` as a working package example. Visual styles belong to the theme; note parsing belongs to plugins.

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

`components` holds shared theme components and the five content slots: `callout`, `codeBlock`, `image`, `link`, and `embed`. A host app can override those five content slots. Host wins, then theme, then the built-in HTML renderer. Layouts and route pages remain theme-owned. Content components receive typed `ContentComponentProps` from `@svartz/ui/runtime`, including `tag`, `attributes`, `text`, slot-specific fields, and a Svelte 5 `children` snippet. Render `{@render children?.()}` to keep nested links and images overridable.

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

## Notes and browser resources

Markdown `.md` and `.mdx` files compile to inert content. Write a `.svx` note when it needs authored Svelte markup or imports. Theme components can style either format, but Markdown itself never executes Svelte expressions.

Content plugins contribute remark or rehype steps and optional CSS, assets, or browser scripts. Browser script modules export `mount(pathname)` and may return a cleanup function. Svartz calls cleanup on navigation, vault changes, and unmount. Do not attach global listeners at module import time.

## Best practices

Keep layouts and route pages in the theme. Use content components for the five Markdown slots. Keep custom note logic in `.svx` files. Test both SSR output and navigation when a theme adds browser scripts.

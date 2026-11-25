---
title: "Create a theme"
description: "Extend minimal with a layout, regions, or a metadata-driven renderer."
---

Start with a minimal extension. Give the browser and Node entries the same identity. In your browser entry:

```ts
import { composeThemes, definePageRenderer, type ThemeExtension } from "@svartz/theme-minimal/runtime";
import RecipePage from "./RecipePage.svelte";

export const extensions: ThemeExtension[] = [{
  id: "@example/theme-recipes",
  name: "recipes",
  renderers: [definePageRenderer({
    id: "recipe",
    detect: (properties) => typeof properties.recipe === "string" ? properties.recipe : undefined,
    body: RecipePage,
  })],
  chrome: { graph: false },
}];

export default (config: Parameters<typeof composeThemes>[1]) =>
  composeThemes(extensions, config, { id: "@example/theme-recipes" });
```

Export a build entry with the same IDs and names, its build plugins and capabilities, and no Svelte component imports. Use the Node entry of `@svartz/theme-minimal` there. Export `./runtime` from the package for the browser entry. Set `theme.base` to the package or a path relative to the config.

A renderer reads frontmatter in `detect`. Return `undefined` for a note it does not own. Return typed data for a match, or throw an error for invalid metadata. The body gets the entry, data, shared shell, and the parent snippets. Render the note's `children` where its prose belongs, and `actions` if you split out the page head. If the layout uses a dynamic component, bind it to a local component variable before rendering it.

For broader changes, replace a region or the frame. Use the shell's explorer, drawer, contents, and page navigation instead of recalculating them. Keep `PageActions` in a replaced page head and `SiteActions` in the navigation so plugin actions still appear. See the [[reference/theme-contract|theme contract]] for slots and the [[themes/choosing-and-composing|composition rules]].

## Manifest

Export a `defineTheme` factory from the package root. `@svartz/vite` loads this Node-safe entry during config validation, so it must not eagerly import `.svelte` files.

```ts
// src/lib/index.ts
import { defineTheme } from "@svartz/core";

export default defineTheme({
  id: "@example/theme",
  version: "1.0.0",
  contractVersion: "1.0.0",
  layouts: {
    defaultPage: () => import("./SiteLayout.svelte"),
    notePage: () => import("./SiteLayout.svelte"),
  },
  routes: [
    { id: "home", pattern: "/", layoutSlot: "notePage" },
    { id: "note", pattern: "/:slug", layoutSlot: "notePage" },
  ],
  components: {
    callout: () => import("./Callout.svelte"),
  },
  capabilities: { callouts: true, codeBlocks: true },
});
```

`defaultPage`, `notePage`, and a `note` route with `:slug` are required. Svartz loads lazy component imports before SSR and hydration; an import without a default component fails with the theme ID and slot. See the [[reference/theme-contract|theme contract]] for all manifest fields.

A host app can override the five content slots (`callout`, `codeBlock`, `image`, `link`, and `embed`). Host overrides win, then the theme, then the built-in HTML renderer. Layouts and route pages remain theme-owned. Content components receive typed `ContentComponentProps` from `@svartz/ui/runtime`, including `tag`, `attributes`, `text`, slot-specific fields, and a Svelte 5 `children` snippet. Render `{@render children?.()}` so nested links and images remain overridable. The `codeBlock` slot wraps a whole element. A highlighted `<figure>` arrives as `tag: "figure"` with its contents in `children`, and a bare `<pre>` arrives as `tag: "pre"` with the `<pre>` itself in `children` so Svelte preserves code whitespace. Render `children` inside your wrapper without recreating the `<pre>`.

## Runtime entry

Publish a `./runtime` export that Vite can bundle in SvelteKit. It can share the manifest factory and use eager or lazy Svelte modules. See `themes/minimal/src/lib/index.ts` and `themes/minimal/src/lib/runtime.ts` for a working pair.

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./runtime": "./dist/runtime.js"
  },
  "peerDependencies": { "svelte": "^5.0.0" }
}
```

Select the theme in `svartz.config.ts` with `theme: { base: "@example/theme" }` or a path relative to the config directory. Extra options beside `base` pass to a factory manifest. To let vaults combine your theme in a `theme.base` array, export its `@svartz/theme-minimal` `extensions` from both entries.

## Build on @svartz/ui

`@svartz/ui` renders Obsidian Markdown the same way in every first-party theme. A new theme can use it and write only layout:

- Import `@svartz/ui/base.css` and `@svartz/ui/prose.css` in the layout, and wrap the note body in `.sv-prose`.
- Spread `svartzContentComponents` into `components` in `runtime.ts` for callouts, code blocks, links, and embeds.
- Pass `svartzSyntax()` from `@svartz/ui/syntax` in `pluginPreset` from `index.ts` only. It replaces `core:transform-syntax` with the Svartz code colours and pulls rehype, so it stays out of browser code.
- Type layouts and pages with `ThemePageProps`. `vault` carries the index, tags, folders, and search documents with deployment URLs.

Themes can only use the routes the pipeline builds, which are notes, `/tags`, `/tags/:slug`, `/folders`, `/folders/:slug`, `/feed`, and `/`. Read the prefixes from `theme.routes` in the vault config, as the pipeline does.

Do not derive folder structure from slugs. A folder note (`guides/index.md`) publishes as `guides` unless a root `guides.md` claims that URL, in which case it publishes as `guides-2`. Each folder lists its notes in `noteSlugs`, names its folder note in `noteSlug`, and takes its `title` from the folder note's frontmatter title when present. Use `folderLayout(entries, folders)` from `@svartz/ui` to read each note's folder and each folder's note.

## Plugin regions and note markers

Plugins mount browser actions into two regions exported by `@svartz/ui` (see [[guides/create-plugin#Add actions to every page|browser actions]]):

- `<PageActions href={entry.markdownHref} />` in every note's header, even when `markdownHref` is unset. It holds Copy page, View as Markdown, and the page-actions region.
- `<SiteActions />` once on every page, in the rail or site navigation and inside the phone drawer.

Render each once per page and let Svelte leave them empty, because plugins own their children. Both take no space while empty, and `base.css` styles the links and buttons plugins mount there.

Plugins that act on note content, such as annotations, find the note body by `data-svartz-note`. Put `data-svartz-note={entry.slug}` on the single element wrapping the rendered note, and omit it on list pages and password-protected notes (`entry.locked`, or a `password_group` property once unlocked). A theme extending `@svartz/theme-minimal` inherits this marker on note and home pages, so its `home` page renders `children` without adding another marker.

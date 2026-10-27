# Composing themes

Every default theme extends `@svartz/theme-minimal`. Minimal's layout is the one shell: it builds the explorer tree, the breadcrumbs, the page's contents, and previous and next links once per page, and hands that shell state to every part of the page. A theme declares only what differs from minimal, so a fix in minimal reaches every theme.

One site can combine themes. The first theme styles the site; every theme renders the pages it claims.

## Compose themes

Each theme package exports its `extensions` from both entries. `composeThemes` from theme-minimal combines them:

```js
// theme/index.js: the build manifest
import { composeThemes } from '@svartz/theme-minimal';
import { extensions as wiki } from '@svartz/theme-wiki';
import { extensions as api } from '@svartz/theme-api-docs';

export default (config) => composeThemes([...wiki, ...api], config, { id: '@acme/site-theme' });
```

```js
// theme/runtime.js: the same themes, with their components
import { composeThemes } from '@svartz/theme-minimal/runtime';
import { extensions as wiki } from '@svartz/theme-wiki/runtime';
import { extensions as api } from '@svartz/theme-api-docs/runtime';

export default (config) => composeThemes([...wiki, ...api], config, { id: '@acme/site-theme' });
```

Point `theme.base` at the directory, as in [Reference themes](reference-themes.md#compose-them). A package that publishes a composition exports the extensions it combines, so it composes further.

## How a page picks its theme

For each page, the first of these that applies wins:

1. The page's own `theme:` frontmatter: `theme: wiki` or `theme: '@svartz/theme-wiki'`.
2. The nearest folder note's `theme:`, so `wiki/index.md` with `theme: wiki` covers everything under `wiki/`.
3. Whichever theme's renderer detects the page from its metadata: `operation` or `model` for API and MCP pages.
4. The first theme, for a plain note.

When `theme:` names a theme, only that theme's renderers detect the page; if none does, the page is a plain note in that theme's style. A folder note's `theme:` also picks the theme whose folder page lists that folder.

The build fails with the page's path when `theme:` names a theme the site doesn't compose, when two themes' renderers claim one page, or when a renderer rejects a page's metadata.

## Write a theme

A theme is an extension of minimal. Every field is optional; minimal itself is the empty extension.

```ts
import { definePageRenderer, type ThemeExtension } from '@svartz/theme-minimal/runtime';

export const extensions: ThemeExtension[] = [{
  id: '@acme/theme-recipes',
  name: 'recipes',                       // what `theme:` frontmatter can say
  frame: RecipesFrame,                   // lays out the regions; minimal's is three columns
  regions: { header: RecipesHeader },    // header, navigation, pageHead, aside, pageFoot, footer
  renderers: [definePageRenderer({
    id: 'recipe',
    detect: (properties) => readRecipe(properties.recipe),   // undefined: not this renderer's page; throw: bad metadata
    body: RecipePage,                    // { shell, data, entry, children }: render children under your own header
    aside: RecipeIngredients,            // optional; replaces the right column on its pages
    explorerItem: (recipe) => ({ badge: { label: 'RECIPE', hue: 'green' }, label: recipe.name })
  })],
  pages: { folder: RecipeGrid },         // home, tags, tag, folders, folder, feed
  chrome: { graph: false, backlinks: false }
}];
```

- **Frame and regions.** Any region a theme doesn't swap stays minimal's. Every region gets `{ shell }`: the vault, the explorer tree with each renderer's rows, the current folder path, the contents, previous and next, the page's chosen theme and renderer, and the phone drawer's state. A swapped region reads that state instead of working it out again. A swapped frame keeps the explorer in an element with `id="explorer-panel"`, gives the menu button `aria-controls="explorer-panel"`, and marks its main element `inert={shell.drawer}`, so the shell's drawer focus handling works.
- **Chrome.** `graph`, `backlinks`, `dates`, `summary` (the description under the title), `readerMode`, `explorerFilter`, and `pageNav` (previous and next) switch minimal's furniture. The first theme's chrome applies to the site.
- **Build extensions.** The Node entry exports the same ids with build plugins and capabilities, and no components: `{ id, name, plugins, capabilities }`.

Never use a dotted component tag on a derived value (`<shell.page.renderer.body />`): server rendering skips it. Bind the component first with `{@const Body = …}`.

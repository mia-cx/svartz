# `@svartz/core`

Shared plugin and theme contracts, resolved vault types, route matching, publication-safe vault views, and protected-note helpers. Plugin and theme author APIs do not require Effect. Plugin shapes and key theme fields are checked at runtime.

## Plugin contract

`definePlugin(factory)` validates and normalizes a `SvartzPlugin`. `createCorePlugins()` lives in `@svartz/plugins`; configured plugins can replace or disable its defaults by ID. Hooks run in the order in `STAGE_NAMES`, with `pre`, default, and `post` tiers inside each stage. The main transform hooks are `transformOfm`, `transformGfm`, `transformToc`, `transformDescription`, `transformSyntax`, `transformLatex`, and `transformEmbeds`. `emitArtifacts` is the final output hook. `handleChange` receives vault file events in dev mode.

```ts
import { CONTRACT_VERSION, definePlugin } from '@svartz/core';

export const upperCase = definePlugin(() => ({
  id: 'example:uppercase',
  contractVersion: CONTRACT_VERSION,
  transformDescription(ctx) {
    for (const file of ctx.files) file.content = file.content.toUpperCase();
  }
}));
```

The runner receives one `ResolvedConfig` per vault. `ProcessedFile` carries the candidate note through discovery, frontmatter, publication, route allocation, and transforms. The final `Index` contains published entries, search documents, graph, backlinks, tags, folders, routes, and reachable assets. `createVaultView` exposes that published index to host routes and themes.

## Theme contract

`defineTheme(manifest | factory)` validates an `SvartzTheme`. A theme supplies layouts, route definitions, optional component slots, and optional plugin presets. `ThemeComponentLoader` accepts an eager Svelte module or a lazy import function. The runtime awaits lazy entries before server rendering and hydration. See [`@svartz/ui`](../ui/README.md) for the SvelteKit route handoff.

```ts
import { CONTRACT_VERSION, defineTheme } from '@svartz/core';
import SiteLayout from './SiteLayout.svelte';

export default defineTheme({
  id: 'example:theme',
  version: '1.0.0',
  contractVersion: CONTRACT_VERSION,
  layouts: {
    defaultPage: { default: SiteLayout },
    notePage: { default: SiteLayout }
  },
  routes: [
    { id: 'note', pattern: '/:slug', layoutSlot: 'notePage' },
    { id: 'tag', pattern: '/tags/:slug', component: () => import('./TagPage.svelte') }
  ]
});
```

The contract major version must match `CONTRACT_VERSION`. Required layouts, route IDs and patterns, and component loaders fail validation when malformed; unknown fields warn. TypeScript checks the rest of the declared contract. The source of truth for exported names is [`src/index.ts`](src/index.ts).

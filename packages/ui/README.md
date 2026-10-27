# `@svartz/ui`

Svelte components used by the built-in theme and host applications.

The standalone SvelteKit shell imports `SvartzRuntimePage` from `@svartz/ui/runtime` and passes the current pathname:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import SvartzRuntimePage from '@svartz/ui/runtime';
</script>

<SvartzRuntimePage pathname={page.url.pathname} />
```

Before rendering that component, the route's universal `load` must prepare its theme:

```ts
import { prepareHostVault } from 'virtual:svartz/host';
import { base } from '$app/paths';

export const load = async ({ url }) => {
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname;
  await prepareHostVault(appPath);
};
```

The generated catchall already does this. A custom route that renders `SvartzRuntimePage` needs the same call. It resolves lazy theme pages before SSR and hydration. To render only a note body inside your own layout, use `SvartzNoteContent`. See [host vaults](../../docs/host-vaults.md#render-a-note-inside-your-own-page).

Theme route components can use lazy imports, including pages that import `@svartz/ui`:

```ts
{ id: 'tag', pattern: '/tags/:slug', component: () => import('./pages/TagPage.svelte') }
```

Add `/// <reference types="@svartz/ui/virtual-modules" />` to `src/app.d.ts` when the shell imports `virtual:svartz/*` directly. The CLI injects these modules during build and dev. Route files and the SvelteKit adapter stay in the consuming app.

## Reference themes

`@svartz/ui/reference/runtime` holds the building blocks behind `@svartz/theme-api-docs` and `@svartz/theme-mcp-docs`: schema trees, code panels, endpoint bars, the reference frame and top bar, renderer types, and `referenceExtension`, which turns page renderers into a theme-minimal extension. `@svartz/ui/reference` has the Node-safe metadata readers and types. The shell itself is theme-minimal's; [Reference themes](../../docs/reference-themes.md) shows how to compose the themes.

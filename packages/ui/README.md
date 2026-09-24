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

The generated catchall already does this. A custom route that renders `SvartzRuntimePage` needs the same call. It resolves lazy theme pages before SSR and hydration.

Theme route components can use lazy imports, including pages that import `@svartz/ui`:

```ts
{ id: 'tag', pattern: '/tags/:slug', component: () => import('./pages/TagPage.svelte') }
```

Add `/// <reference types="@svartz/ui/virtual-modules" />` to `src/app.d.ts` when the shell imports `virtual:svartz/*` directly. The CLI injects these modules during build and dev. Route files and the SvelteKit adapter stay in the consuming app.

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

Add `/// <reference types="@svartz/ui/virtual-modules" />` to `src/app.d.ts` when the shell imports `virtual:svartz/*` directly. The CLI injects these modules during build and dev. Route files and the SvelteKit adapter stay in the consuming app.

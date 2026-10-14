# Multiple vaults in one SvelteKit host

Place vaults in the host's `svartz.config.ts` with separate `mountPath` values. The host keeps its own SvelteKit routes and adapter.

Svartz also loads `.mjs` and `.js` config files. Calls to `loadConfig` in the same process pick up edits to `.mjs`, ESM `.js`, and `.ts` files. An ESM `.js` config follows its nearest `package.json` with `"type": "module"`.

```ts
import { defineConfig } from '@svartz/config';

export default defineConfig({
  version: '1.0.0',
  vaults: [
    { id: 'journal', path: './content/journal', mountPath: '/journal', target: { type: 'host' } },
    { id: 'work', path: './content/work', mountPath: '/work', target: { type: 'host' } }
  ]
});
```

`svartz build` composes every host vault into one SvelteKit build. `svartz dev` serves them in one process. `--vault <id>` still validates the named vault, but a host build includes all configured vaults because they share one output. `npx svartz init` adds the Svartz catchall if the app has none. It preserves an existing catchall and all manual routes. A manual route such as `src/routes/journal/about/+page.svelte` takes priority over the vault page at that URL.

Each vault gets its own theme, publication filter, generated artifacts, and asset URL namespace. A file named `image.png` in both vaults is served at `/journal/image.png` and `/work/image.png`. Overlapping mounts, including `/` beside `/journal`, fail config loading. Output roots must also stay separate, even when an existing or dangling symlink makes two configured paths point to the same directory. Filesystem failures while checking those roots return a tagged `VaultBuildRootResolutionFailed` error.

The generated `virtual:svartz/host` module exposes `vaults`, combined `routes`, `resolveHostVault(pathname)`, and `prepareHostVault(pathname)`. `vaults` holds each mount's published index and site settings for route lookup and opt-in discovery. Runtime artifacts and theme code load only when `prepareHostVault` selects that mount. The default catchall uses `routes` for redirects and 404s, then awaits `prepareHostVault` before rendering. If a custom route renders `SvartzRuntimePage`, call `prepareHostVault` in its universal `load` too, using the pathname after removing SvelteKit's deployment base. This prepares lazy theme components for both server rendering and client hydration. Hosts can import `virtual:svartz/artifacts` for a single-vault build or use the registry to select a vault in a composed build. See the [published vault view](vault-view.md) for typed note data.

During `svartz dev`, edits to a local workspace theme rebuild that theme package before the host restarts. This keeps package exports pointing at `dist` in sync with source edits.

Each vault can emit its own RSS feed and sitemap. A host can also select vaults for a combined feed or sitemap in a manual SvelteKit route. See [feeds and sitemaps](discovery.md).

When the CLI builds one local workspace theme, its source manifest supplies build plugins and its source path overrides the packaged theme in both SvelteKit build phases. Published themes use their runtime package entry.

An existing host can use `vite.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs`. During `svartz dev`, edits to local files imported by that config restart the host runner. Explicit directory themes may use package exports without a root `index.js`; the built-in theme resolves from Svartz's installation.

## Render a note inside your own page

`SvartzRuntimePage` draws the whole theme page. To keep your own layout, render only the note body with `SvartzNoteContent` from `@svartz/ui/runtime`. Read the title, properties, dates and backlinks from the [published vault view](vault-view.md).

`SvartzNoteContent` takes three props:

- `pathname` is the app pathname without SvelteKit's deployment base. Pass the same value you gave `prepareHostVault`.
- `stylesheets` is required. It lists the note's CSS links. Compute it with `noteStylesheets(pathname)` in the route's server `load` (`+page.server.ts`).
- `contentComponents` is optional. It overrides the theme's callout, code block, image, link and embed components.

The body uses the theme's content components plus your overrides. A protected note shows the same unlock form as the theme page. The component renders the shared and note-specific CSS links in `<svelte:head>` while a note renders. Compute them in a server `load`, not in the universal `load` or the page: the registry knows a note's CSS only on the server, a universal `load` reruns during hydration and would pass an empty list, and server `load` data is serialized into the page. On client navigation the list is empty and Vite loads the note CSS with its module. It renders no layout, header, table of contents or backlinks. For a pathname that is not a published note it renders nothing. Your `load` decides on the 404.

This route serves the `work` vault, mounted at `/work`, inside the host's own design. Canonical note URLs end with a slash, such as `/work/maelstrom/`. The route sets `trailingSlash` to match, and `load` adds the slash before it looks up the vault.

```ts
// src/routes/work/[...slug]/+page.server.ts
import { noteStylesheets } from '@svartz/ui/runtime';
import { vaults } from 'virtual:svartz/host';
import type { PageServerLoad } from './$types';

const work = vaults.find((vault) => vault.id === 'work')!;

export const load: PageServerLoad = ({ url }) => {
  const appPath = url.pathname.slice(work.basePath.length) || '/';
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  return { stylesheets: noteStylesheets(pathname) };
};
```

```ts
// src/routes/work/[...slug]/+page.ts
import { error, redirect } from '@sveltejs/kit';
import { prepareHostVault, vaults } from 'virtual:svartz/host';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;
export const trailingSlash = 'always';

const work = vaults.find((vault) => vault.id === 'work')!;
const { notes, redirects } = work.artifacts.index.routes;

export const load: PageLoad = async ({ url, data }) => {
  const appPath = url.pathname.slice(work.basePath.length) || '/';
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  const destination = redirects[pathname];
  if (destination) redirect(308, `${work.basePath}${destination}`);
  if (!notes.includes(pathname)) error(404, 'Note not found');
  const vault = await prepareHostVault(pathname);
  const note = vault?.artifacts.vault.note(`${work.basePath}${pathname}`);
  return {
    ...data,
    pathname,
    entry: note?.entry,
    backlinks: note?.backlinks ?? []
  };
};

export const entries: EntryGenerator = () =>
  [...notes, ...Object.keys(redirects)].map((pathname) => ({
    slug: pathname.slice('/work/'.length, -1)
  }));
```

```svelte
<!-- src/routes/work/[...slug]/+page.svelte -->
<script lang="ts">
  import 'virtual:svartz/tailwind-sources.css';
  import { SvartzNoteContent } from '@svartz/ui/runtime';
  import SiteHeader from '$lib/SiteHeader.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.entry?.title ?? 'Protected note'}</title></svelte:head>

<SiteHeader />
<article>
  {#if data.entry}<h1>{data.entry.title}</h1>{/if}
  <SvartzNoteContent pathname={data.pathname} stylesheets={data.stylesheets} />
  {#if data.backlinks.length > 0}
    <h2>Linked from</h2>
    <ul>
      {#each data.backlinks as backlink (backlink.slug)}
        <li><a href={backlink.href}>{backlink.title}</a></li>
      {/each}
    </ul>
  {/if}
</article>
```

`work.basePath` is the absolute deployment base, SvelteKit's `kit.paths.base`, so the route slices the URL with it instead of `$app/paths.base`, which can be relative during SSR. `routes.notes` includes hidden protected notes. Those have no `vault.note()` entry until unlock, so the page shows no title for them. `vault.note()` matches hrefs that include the deployment base. Redirects follow the vault's alias redirects like the generated catchall. The `entries` generator reads route metadata in `vaults`, which needs no runtime code. The route takes priority over the Svartz catchall for every URL under `/work`. Import `virtual:svartz/tailwind-sources.css` once in the host, as the generated catchall does, so theme content classes get their styles. Add `/// <reference types="@svartz/vite/virtual-modules" />` to `src/app.d.ts`, the declarations the CLI template uses.

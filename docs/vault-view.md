# Published vault view

`virtual:svartz/artifacts` exports `vault`, a typed view of the current published vault in a single-vault build. In a host with multiple mounts, await `prepareHostVault(appPathname)` before selecting `resolveHostVault(appPathname)?.artifacts.vault` from `virtual:svartz/host`. Remove SvelteKit's deployment base from the pathname first. The view is available to SvelteKit server loaders and themes. `vault.id` identifies the vault. `vault.entries`, `vault.search`, `vault.tags`, `vault.folders`, and `vault.routes` carry final URLs. Those URLs already include the SvelteKit deployment base and the vault's `mountPath`.

```ts
// src/routes/[...slug]/+page.server.ts in a Svartz-enabled SvelteKit app
import { error } from '@sveltejs/kit';
import { vault } from 'virtual:svartz/artifacts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const note = vault.note(url.pathname);
  if (!note) error(404, 'Note not found');
  return { entry: note.entry, outgoing: note.outgoing, backlinks: note.backlinks };
};
```

`vault.note()` accepts a canonical slug or final URL path. It returns `undefined` for a missing or unpublished note. Its entry contains `properties` (published frontmatter), `page.toc`, `page.comments`, heading `toc`, resolved `links`, dates, canonical `href`, and optional `socialImage`. Generated image paths in the view already include the deployment base and vault mount. Graph and backlinks contain published notes only. Unresolved links have a null `href`.

Search uses one MiniSearch schema in the artifact producer and browser. `searchOptions` and `searchIndex` are also exported by the virtual module. Use `vault.search` to map result IDs to final URLs, because a stored search index contains URLs before SvelteKit's deployment base is applied.

This view belongs to one vault. A [multi-vault host](host-vaults.md) selects the view by mount.

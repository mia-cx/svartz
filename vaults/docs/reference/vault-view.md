---
title: "Published vault view"
description: "Read published entries, routes, search, and links from SvelteKit."
---

Use `vault` from `virtual:svartz/artifacts` in a single-vault build. In a multi-vault host, call `prepareHostVault(appPathname)` and read `resolveHostVault(appPathname)?.artifacts.vault` from `virtual:svartz/host`. `appPathname` excludes the SvelteKit deployment base. The resulting view's URLs already include the base and the mount.

```ts
import { error } from "@sveltejs/kit";
import { vault } from "virtual:svartz/artifacts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const note = vault.note(url.pathname);
  if (!note) error(404, "Note not found");
  return { entry: note.entry, outgoing: note.outgoing, backlinks: note.backlinks };
};
```

| Field | Contents |
| --- | --- |
| `id` | Vault ID. |
| `entries` | Published index entries, with canonical URLs, dates, display titles and descriptions, frontmatter, links, and optional social image and Markdown URLs. |
| `search` | Search documents with final URLs. |
| `graph`, `backlinks` | Relationships keyed by published note slug. |
| `tags`, `folders` | Listings with final URLs. |
| `routes` | Mount, note and listing URLs, redirects, and theme routes. |
| `assets` | Published asset index. |
| `note(reference)` | Lookup by canonical slug, href, or encoded pathname. Returns `{ entry, outgoing, backlinks }` or `undefined`. |

`entry.properties` preserves authored public frontmatter, including blank title or description fields. Use `entry.title` and `entry.description` for the display values. `entry.page` carries switches such as `toc` and `comments`; `entry.toc` lists headings. `entry.links` includes unresolved targets with a null `href`.

`virtual:svartz/artifacts` also exports `searchOptions` and `searchIndex` for MiniSearch. Use `vault.search` to map result IDs to final URLs because the stored search index precedes deployment-base resolution.

## Index-only hosts

`virtual:svartz/index` exports `vaults` as records with `id`, `mountPath`, `basePath`, `index`, and `siteConfig`. It has no page-runtime or theme import. The index entry's `href` already includes the mount but not `basePath`. When [[reference/configuration|index.markdown]] is enabled, you can link copies through `entry.markdownHref`. Check that it exists before linking.

```svelte
<script lang="ts">
  import { vaults } from "virtual:svartz/index";
  const notes = vaults.find((vault) => vault.id === "notes");
</script>

{#if notes}
  {#each notes.index.entries as entry}
    {#if entry.markdownHref}
      <a href={notes.basePath + entry.markdownHref}>{entry.title}</a>
    {/if}
  {/each}
{/if}
```

See [[guides/host-vaults|Publish vaults in a SvelteKit app]] to set up the virtual modules.

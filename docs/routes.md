# Vault routes

Set `mountPath` on a vault to place it beneath a path in an existing SvelteKit app. The vault's disk `path` and URL `mountPath` are independent. The host's `kit.paths.base` is the deployment prefix and is applied separately.

```ts
export default {
  version: "1.0.0",
  vaults: [
    { id: "journal", path: "vaults/journal", mountPath: "/journal", target: { type: "host" } },
  ],
};
```

The selected vault's note URLs, tags, folders, and redirects include its mount path. A `target.basePath` for a standalone build controls SvelteKit's deployment base; it is not a vault mount. One host build can serve multiple non-overlapping vault mounts.

Set `slug` in note frontmatter to choose the last URL segment without renaming the file. `guides/Setup Notes.md` with `slug: setup` lives at `/journal/guides/setup/` under the `/journal` mount. Parent folders keep their normalized paths. The value uses the same normalization as filenames. A value that is not a non-empty string, normalizes to empty or to `index`, is only dots such as `.` or `..`, or contains `/` fails the build with the note's path. Folder notes such as `index.md`, `index.mdx`, and `_index.md` cannot set `slug`.

Published notes claim canonical URLs after publication filtering. Explicit slugs claim URLs before filenames. Two explicit slugs that claim the same URL fail the build with both note paths. Among natural filenames, an exact filename wins over a name that normalizes to the same URL. For example, `hello-world.md` takes `/hello-world/`, while `hello world.md` gets `/hello-world-3/` when `hello world 2.md` already owns `/hello-world-2/`. Natural names that collide with explicit slugs use the same numeric suffixes. Allocation sorts source paths, so discovery order does not change the result. No URL is promised stable across a rename or a new collision.

Static host SvelteKit routes, including layout-reset pages such as `+page@.svelte`, take precedence inside a mount. A note at `about.md` moves to `/journal/about-2/` if the host owns `/journal/about/`. Explicit slugs also move to a numeric suffix when the host owns their URL. Other authored host routes follow SvelteKit's normal specificity rules. Keep the Svartz fallback at `[...slug]` beneath the host routes.

`alias`, `aliases`, and `permalink` in note frontmatter create redirects to the canonical URL, preserving dots in names such as `v1.2`. They point to the allocated URL when a note sets `slug`. The `slug` property itself creates no redirect. Redirects never replace the canonical URL or claim a canonical or static host route. `IndexEntry.href`, `SearchDocument.href`, and `Index.routes` carry allocated paths; consumers should use those fields instead of constructing paths from slugs. Unresolved links have no href and stay out of the graph.

Published notes also create tag and folder listings under the mount, such as `/journal/tags/ideas/` and `/journal/folders/guides/deep/`. Each ancestor folder counts its published descendants, including a folder's `index.md`. `Index.folders[].noteSlugs` records the same physical membership for rendering, even when canonical note URLs change after a collision. A folder note owns its natural URL (`/journal/guides/`); the generated listing remains at `/journal/folders/guides/`. An authored note at a listing URL renders there instead of the listing. A manual SvelteKit route takes priority over both. Static builds prerender generated listing URLs; rebuilding after a note is removed drops its empty folders and tags.

Themes may define concrete component pages such as `/about`. Svartz adds those pages to prerender entries and sitemaps under the vault mount. Dynamic theme patterns and routes marked `prerender: false` do not create static entries. An authored note at the same URL wins over the theme page; a manual SvelteKit route wins over both.

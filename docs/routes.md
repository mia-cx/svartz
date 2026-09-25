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

The selected vault's note URLs, tags, folders, and redirects include its mount path. A `target.basePath` for a standalone build controls SvelteKit's deployment base; it is not a vault mount. The current CLI builds each host vault separately; combining two mounts in one host build is tracked in #51.

Published notes claim canonical URLs after publication filtering. An exact filename wins over a name that normalizes to the same URL. For example, `hello-world.md` takes `/hello-world/`, while `hello world.md` gets `/hello-world-3/` when `hello world 2.md` already owns `/hello-world-2/`. Allocation sorts source paths, so discovery order does not change the result. No URL is promised stable across a rename or a new collision.

Static host SvelteKit routes take precedence inside a mount. A note at `about.md` moves to `/journal/about-2/` if the host owns `/journal/about/`. Other authored host routes follow SvelteKit's normal specificity rules. Keep the Svartz fallback at `[...slug]` beneath the host routes.

`alias`, `aliases`, and `permalink` in note frontmatter create redirects to the canonical URL. They never replace it or claim a canonical or static host route. `IndexEntry.href`, `SearchDocument.href`, and `Index.routes` carry allocated paths; consumers should use those fields instead of constructing paths from slugs. Unresolved links have no href and stay out of the graph.

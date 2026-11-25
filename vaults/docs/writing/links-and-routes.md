---
title: "Links and routes"
order: 3
description: "Link to notes by filename and control their public URLs."
---

Use `[[writing/frontmatter|frontmatter]]` syntax to link by vault path with a custom label. A local Markdown link such as `[Wiring](./Wiring.md)` first resolves from the source note's folder. With a leading slash, it tries the vault root. An unresolved wikilink has no destination and does not enter the graph.

| `linkResolution` | How Svartz breaks a basename tie |
| --- | --- |
| `closest` (default) | Most shared parent folders, then shallowest path, then slug order. |
| `shallowest` | Fewest folders, then slug order. |
| `absolute` | No basename fallback. Use a known path, slug, or alias. |

Direct matches take precedence over the fallback. Use full vault paths when two notes share a name.

## Give a page a URL

Svartz normalizes folder and file names into URL segments. For example, `Guides/Setup Notes.md` publishes at `/guides/setup-notes/`. Add `slug: setup` for `/guides/setup/`. The slug must be a nonempty segment. It cannot contain slashes, normalize to `index`, or consist only of dots. Folder notes cannot set it.

Two explicit slugs that claim the same URL fail the build. Filename collisions receive numeric suffixes, with an exact filename winning over one that normalizes to the same path. A host's authored static route has priority, even over an explicit slug.

Use `aliases`, `alias`, or `permalink` to keep an old address as a redirect. Redirects do not replace canonical URLs or host-owned routes. Changing the `slug` alone does not keep the old address.

## Give a folder a landing page

Create `Guides/index.md`, `Guides/_index.md`, or `Guides/Guides.md` (matching the folder name case-sensitively). The folder note lives at `/guides/`. If a folder has more than one, `index.md` is its folder note, then `_index.md`, then `Guides/Guides.md`. The others publish at numbered URLs such as `/guides-2/`, like any other notes that want the same URL. The default folder listing is a separate page at `/folders/guides/`.

A [[guides/host-vaults|host mount]] prefixes vault routes. A [[start/deploying|deployment base]] applies to the whole app and is separate.

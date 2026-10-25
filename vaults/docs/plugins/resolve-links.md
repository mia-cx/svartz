# Resolve links

`resolveLinks()` provides `core:resolve-links` in the `resolveLinks` stage. It rewrites each published note's wikilinks and Markdown links to relative route hrefs, records the targets in `file.links` for backlinks, and fills `file.linkTargets`. The hook is fatal: a failure stops the build.

## Wikilinks

`[[target]]` names a note anywhere in the vault. An exact path, filename, or alias wins. Otherwise the vault's `linkResolution` strategy picks among notes with the same basename:

- `closest` prefers the note sharing the most folders with the linking note.
- `shallowest` prefers the note nearest the vault root.
- `absolute` resolves only exact paths, filenames, and aliases.

Ties break by path depth, then alphabetically. An unresolved wikilink renders as a disabled link.

## Markdown links

`[label](path.md)` names a file path, as a browser would. Svartz resolves it against the linking note's folder first, so `[API](index.md)` in `reference/api/reading.md` opens `reference/api/index.md`. `../` climbs from that folder. A leading `/` starts at the vault root. Percent-encoded names such as `Getting%20Started.md` decode first. The folder is the note's physical folder, even when a frontmatter `slug` moves its URL.

When no file exists at that path, the link falls back to wikilink resolution. A link that still resolves nowhere stays as authored. A `#fragment` carries over as the heading anchor on the target page.

Disable the plugin with `{ id: "core:resolve-links", disabled: true }` or replace the same ID. See [[contracts/plugin-contract]].

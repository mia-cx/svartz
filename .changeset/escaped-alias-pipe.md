---
"@svartz/plugins": patch
"svartz": patch
---

A wikilink or embed with an alias inside a table cell now resolves. Obsidian writes the alias separator there as `\|`, as in `[[Setup\|Install the sensor]]`, and Svartz used to keep the backslash in the link's target and show the link unresolved.

The managed Turbo build task for a `cloudflare-workers` vault now caches the Worker's bundle and `wrangler.json`, which `wrangler deploy` reads, instead of `dist/`. Before, a cache hit restored no deployable Worker.

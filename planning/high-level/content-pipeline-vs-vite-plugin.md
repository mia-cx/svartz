# Content pipeline vs. Vite plugin: why a separate package?

## TL;DR

**Everything does go through the Vite plugin.** The plugin is the only entry point at build/dev time. The question is: where does the **vault logic** (walking, wikilinks, graph, search) live?

**Recommendation:** Put vault traversal, wikilink resolution, and artifact generation (manifest, graph, search index) in **one package** (e.g. `@svartz/content-pipeline` or `@svartz/vault`). The Vite plugin **imports** that package and just: (1) calls it with `VAULT_DIR`, (2) writes output to `src/lib/generated/`, (3) in dev, watches and re-calls. No vault logic inside the plugin.

So we don’t have “content-pipeline separate from the plugin” in the sense of two competing paths — we have **one pipeline package** that the plugin **uses**. The separation is “vault/obsidian logic in a package” vs “Vite integration in the plugin.”

---

## Why not put everything in the Vite plugin?

- **Testability:** Wikilink resolution, slug rules, and graph building are easy to unit test without Vite. If they live inside the plugin, you need to run Vite to test them.
- **Reusability:** The CLI or other tools might want to run the pipeline (e.g. `svartz vault config show` listing notes, or a future non-Vite build). A package can be required from the plugin and from the CLI.
- **Single responsibility:** The plugin’s job is “run at build/dev time, write files, watch in dev.” The pipeline’s job is “given a vault path, produce manifest, graph, search index.” Different concerns.

So: **abstract the Obsidian vault walking, traversal, and wikilink resolution (and graph/search) into one package.** The Vite plugin stays thin: read env → call pipeline → write artifacts → (in dev) watch and re-run.

---

## What goes in the pipeline package?

At minimum:

- **Vault walking** — Discover `.md` (and assets) under a root, respect `.obsidian` and ignore patterns.
- **Frontmatter parsing** — Title, tags, dates, etc.
- **Slug rules** — Path → canonical slug; collision handling.
- **Wikilink resolution** — `[[Page]]`, `[[Page|Label]]` → resolved slug/target.

Optionally in the same package (or we could split later):

- **Graph / backlinks** — Build link graph from wikilinks; compute backlinks per note.
- **Search index** — Build a minimal index (title, headings, tags) for client-side search.

Output: **manifest** (list of notes + metadata), **graph**, **search index** (e.g. JSON files or in-memory structures the plugin writes to disk).

The **Vite plugin** then only:

1. Reads `VAULT_DIR` (and related env).
2. Calls `pipeline.build({ vaultDir, outputDir })` (or similar).
3. Writes the returned data to `src/lib/generated/`.
4. In dev: watches `vaultDir`, re-runs pipeline, triggers HMR.

---

## Package name and scope

- **@svartz/content-pipeline** — Vault walk + wikilink + manifest + graph + search. One package, one API. Plugin imports it.
- Or **@svartz/vault** — If we want a narrower name; same idea (vault-centric logic).

No need for a *second* “content-pipeline” concept; the pipeline **is** this package. The plugin is the Vite glue.

---

## Summary

| Layer | Responsibility |
|-------|-----------------|
| **@svartz/content-pipeline** (or **@svartz/vault**) | Vault walking, wikilink resolution, slug rules, manifest, graph, search index. Testable without Vite. |
| **@svartz/vite-plugin** | Read env, call pipeline, write artifacts to `src/lib/generated/`, watch in dev. No vault logic. |

So: **yes, abstract vault walking and wikilink resolution (and the rest of the pipeline) into one package imported by the Vite plugin.** We don’t want a separate “content-pipeline” that bypasses the plugin; we want one pipeline package that the plugin uses so everything still goes through the plugin at runtime.

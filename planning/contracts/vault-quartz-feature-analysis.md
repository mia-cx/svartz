# Vault Package: Quartz Feature Analysis

## Crucial for Svartz Vault (MUST HAVE)

✅ **Frontmatter extraction** — YAML parsing
✅ **Slug generation** — Consistent, conflict-detecting
✅ **Wikilink resolution** — Parse, resolve, populate `links[]`
✅ **Tags & aliases** — Extract from frontmatter
✅ **Draft/publish filtering** — `draft` or `publish` frontmatter field
✅ **Description extraction** — First sentences for preview/metadata

## Important for Route/App Layer (NOT vault's job)

- Syntax highlighting (rendering)
- LaTeX/math rendering (rendering)
- Table of Contents (rendering from HTML)
- Callout/embed rendering (rendering)
- GFM parsing (rendering)
- Line break conversion (rendering)

## Nice-to-Have for Future

- [ ] **Heading extraction** — Extract `# Heading`, `## Subheading` for TOC data
- [ ] **External link detection** — Track outbound links separately (for metadata)
- [ ] **Git-based dates** — `createdAt`, `modifiedAt` from git log (would require `git` CLI dependency)
- [ ] **Word/reading time** — Basic text statistics
- [ ] **Code block detection** — For search indexing

## Why NOT in vault MVP

The vault package is **data extraction**, not **rendering**. Features like syntax highlighting, LaTeX rendering, callouts are handled by:
1. **mdsvex** — processes the markdown during build
2. **Theme components** — render the Obsidian-flavored elements
3. **Browser** — client-side rendering

So the vault package should stay **minimal and focused**: traverse, manifest, resolve wikilinks, extract basic metadata. Rendering happens later in the pipeline.

## Recommended Additions for MVP

We could add **heading extraction** as it's useful for:
- Building a table of contents
- Search indexing (Quartz does this)
- Navigation breadcrumbs

**Heading extraction:**
```ts
export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  slug: string; // #heading-slug
}

export function extractHeadings(markdown: string): Heading[]
```

This would be part of `buildManifest()` output: `ManifestEntry.headings: Heading[]`

---

## Bottom Line

**For vault MVP:** FrontMatter, Slugs, Wikilinks, Tags, Aliases, Draft, Description
**Keep rendering to:** Vite plugin, mdsvex, theme components

---
name: next-steps backlog
overview: Create NEXT_STEPS.md as the high-priority implementation backlog, reconcile TODO.md, and define the implementation contract (pipeline order, ownership, acceptance criteria) so a follow-up agent (e.g. GPT-5.4 or Opus) can execute the backlog.
todos:
  - id: verify-status
    content: Re-read packages/plugins and packages/config sources; confirm stubs, discovery filter, and helper ownership match Verified State before any edits.
    status: completed
  - id: write-next-steps
    content: Create NEXT_STEPS.md at repo root with exactly five sections and bullets from Locked Contract + Backlog Content; use relative paths and no duplicate bullets.
    status: completed
  - id: reconcile-todo
    content: Update TODO.md so no bullet is duplicated in NEXT_STEPS.md; remove or reword Next plan queue and overlapping Active backlog items; keep SEO, docs, i18n, deferred.
    status: completed
  - id: review-close
    content: Grep NEXT_STEPS.md and TODO.md for overlapping phrasing; confirm theme resolution and theme requirements are not stated as open questions in TODO.md.
    status: completed
isProject: false
---

# Next-Steps Backlog — Implementation Contract

## Scope

- **Phase 1 (this plan):** Produce `NEXT_STEPS.md`, reconcile `TODO.md`, and leave a single source of truth for high-priority work plus a contract for implementers.
- **Phase 2 (future):** An agent implementing the content of `NEXT_STEPS.md` must follow the **Locked Contract** and **Canonical pipeline order** below; this plan is the implementation contract for that work.

---

## Locked Contract

### Shared helpers (keep in `packages/plugins/src/internal/`)

- **fileToSlug** (slug.ts) — used by discover-files and resolve-links; canonical slug contract.
- **normalizeDateTime** (datetime.ts) — generic date parsing; used by index-content.

### Plugin-owned logic (move out of shared; no other plugin uses)

- **parse-frontmatter** — Only responsibility: split frontmatter and body markdown. Inline `extractFrontmatter()` (gray-matter) here; do not parse or emit raw links.
- **resolve-links** — Owns: raw-link extraction, slug map build, link resolution, and link rewrite. Move `extractRawLinks()`, `buildSlugMap()`, and `resolveLink()` into this plugin (or a private module used only by it). Rewrite internal md/wikilinks to runtime-safe output: default `<a href="...">`, or a plugin-configured Svelte component that accepts at least `href`. Config: optional `linkComponent` in plugin options. **Note:** Links that are embeds (prefixed with `!`, e.g. `![[note]]` or `![alt](image.png)`) must not be rewritten to `<a>` or the link component; leave them for the embed/transclusion plugin to handle. **Note:** Links that are embeds (prefixed with `!`, e.g. `![[note]]` or `![alt](image.png)`) must not be rewritten to `<a>` or the link component; leave them for the embed/transclusion plugin to handle.
- **transform-description** — Sole owner of final per-file description and title fallback. Inline `extractDescription()` and move `deriveTitle()` here. Downstream plugins (e.g. index-content) read `file.frontmatter` / description set by this plugin; they do not compute description or title.
- **discover-files** — Owns include/exclude filtering. Use resolved config `include`/`exclude` only; no hardcoded `.md`. Inline or own all logic currently in `internal/ignore.ts` (shouldIgnore, shouldIncludePath) inside discover-files; remove shared ignore helpers if unused elsewhere.
- **Word-count plugin** — New plugin after parse-frontmatter, before embed. Strips frontmatter (already split), HTML comments `<!-- -->`, markdown comments `%% %%`, and tag markup; counts text inside HTML. No shared `countWords()`; implement or use a library that matches these rules.
- **index-content** — Consumes `file.links` (from resolve-links) and `file.frontmatter`/description/title (from transform-description). Builds `entries`, `graph`, `backlinks`; add MiniSearch index builder step emitting a search-ready artifact. Aliases are not required for index/graph; entry.links exist for graph and search weighting.
- **Emit-artifacts** — Materializes artifact bag to disk. Immediately before it, a thin **mdsvex wrapper** step turns transformed markdown/HTML note content into Svelte and adds note modules to the artifact bag; emit-artifacts then writes them under `.svartz/vaults/<vaultId>/artifacts`.

### Theme and generation

- Theme `requirements` and `capabilities` are metadata only. Themes satisfy needs via `plugins[]` preset merged by `@svartz/vite`; core plugins do not branch on theme metadata.
- Non-note routes (folder/tag/error) are theme-owned; pipeline does not have to emit them. Without a theme there is no UI, only artifacts and manifests.

### Link rewrite

- resolve-links plugin options may include optional `linkComponent` (Svelte component). Contract: component receives at least `href`. If absent, output plain `<a>`.

### TOC and embedding

- TOC: source note only; exclude headings that come from embedded content.
- Embedder runs after all other content transformers so embedded content is fully transformed. Word count runs before embedding (does not count embedded note content).

---

## Canonical pipeline order

Execution order for the core pipeline (to be reflected in `packages/plugins/src/index.ts` when implementing):

1. discoverFiles (config-driven include/exclude; no hardcoded `.md`)
2. parseFrontmatter (frontmatter + body only; no link extraction)
3. filterUnpublished
4. resolveLinks (raw-link parse, slug map, resolve, rewrite links in content)
5. wordCount (new; after frontmatter, before embed)
6. transformOfm
7. transformGfm
8. transformSyntax (Shiki; options expose Shiki config)
9. transformLatex
10. transformToc (source-note headings only)
11. transformDescription (description + title fallback; sole owner)
12. embed/transclusion (recursive; heading-targeted section transclusion)
13. mdsvex wrapper (markdown/HTML → Svelte; push note modules into artifact bag)
14. indexContent (entries, graph, backlinks, MiniSearch index)
15. emitArtifacts (write artifact bag to disk)

Current code has transformDescription and transformToc earlier; when implementing, reorder so that description runs after TOC and embed runs after all transforms; word count and mdsvex wrapper are new steps.

---

## Verified state (pre-execution)

- Transform plugins OFM, GFM, TOC, Syntax, LaTeX in `packages/plugins/src/transform-*.ts` are stubs.
- `index-content.ts` produces entries, graph, backlinks; no MiniSearch yet.
- `internal/parse.ts`: extractFrontmatter (single use parse-frontmatter), extractRawLinks (move to resolve-links), extractDescription (move to transform-description), countWords (replace by word-count plugin).
- `internal/resolve.ts`: buildSlugMap and resolveLink used only by resolve-links; move into that plugin.
- `internal/slug.ts`: fileToSlug remains shared; deriveTitle moves to transform-description.
- `discover-files.ts`: hardcodes `.md` and uses include/exclude; must switch to resolved config include patterns and own all include/exclude logic.
- Theme resolution is in `@svartz/vite`; theme requirements/capabilities are metadata only.

---

## Phase 1: Deliverables and steps

### Step 1 — Verify

- Re-read `packages/plugins/src/parse-frontmatter.ts`, `internal/parse.ts`, `resolve-links.ts`, `transform-description.ts`, `index-content.ts`, `discover-files.ts`, `internal/resolve.ts`, `internal/ignore.ts`, and `index.ts`.
- Confirm: extractFrontmatter only in parse-frontmatter; extractRawLinks in parse; buildSlugMap/resolveLink only in resolve-links; discover uses only `.md` and shared ignore. Mark any drift in a one-line note.

### Step 2 — Create NEXT_STEPS.md

- Create `NEXT_STEPS.md` at repo root.
- Structure: five sections with headings and bullets. Use the **Backlog content** below verbatim for section bullets (relative paths, e.g. `packages/plugins/...`). No numbering of sections required; section titles are enough.

### Step 3 — Reconcile TODO.md

- Remove or reword the "Next plan queue" block so its items appear only in NEXT_STEPS.md.
- In Active backlog, remove or shorten items that are now fully covered in NEXT_STEPS.md (e.g. theme-minimal, @svartz/ui, CLI, watch/HMR, OFM/GFM/syntax/LaTeX/embed, assets, TOC, transclusion). Keep SEO, feeds, i18n, dev experience, deferred.
- Ensure no bullet in TODO.md is a verbatim duplicate of a bullet in NEXT_STEPS.md.
- Leave "Foundation already in place" and "Notes" intact unless they contradict the contract above.

### Step 4 — Review

- Grep for "theme resolution", "theme requirements", "requirements and capabilities" in TODO.md; ensure they are not stated as open questions.
- Spot-check NEXT_STEPS.md for the five sections and for at least: config-driven discovery, resolve-links ownership, mdsvex wrapper before emit-artifacts, word count before embed, TOC source-note only, MiniSearch in index-content, theme metadata-only.

---

## Backlog content (for NEXT_STEPS.md)

Copy the following into NEXT_STEPS.md as the body. Section titles must be preserved; paths are relative to repo root.

### Section 1 — Markdown parity and embedding

- Inline extractFrontmatter in parse-frontmatter; parse-frontmatter only splits frontmatter and body.
- Move extractRawLinks, buildSlugMap, resolveLink into resolve-links; resolve-links rewrites internal links to `<a>` or optional linkComponent (min contract: href). Do not rewrite embed-style links (`![[...]]` / `![...](...)`); those are handled by the embed/transclusion plugin.
- Inline extractDescription and move deriveTitle into transform-description; transform-description is sole owner of final description and title fallback.
- Add word-count plugin after parse-frontmatter, before embed; strip HTML/md comments and tag markup; count text inside tags only.
- Implement OFM, GFM, Shiki syntax (options expose Shiki config), LaTeX transforms.
- TOC extraction: source-note headings only, exclude embedded content.
- Recursive markdown embedding/transclusion with heading-targeted section transclusion; embedder runs after all other transformers.
- Thin mdsvex wrapper step immediately before emit-artifacts: transformed md/HTML → Svelte, add note modules to artifact bag.
- MiniSearch index builder in index-content alongside entries, graph, backlinks.
- Discovery from resolved config include patterns (no hardcoded .md); include/exclude owned by discover-files. Asset discovery and pass-through emitters for images, audio, video, PDF; attachment/image path rewriting and embed conventions (OFM/embedder).

### Section 2 — Theme-minimal and shared UI

- Build theme-minimal against the theme contract; theme-specific behavior via plugins in theme plugins[] merged by @svartz/vite; requirements/capabilities metadata only.
- @svartz/ui: shared theme-agnostic components — Link, TableOfContents, Breadcrumbs, FileTrie, backlinks, graph, search (bar + modal). Consumed by theme-minimal and other themes.
- Real note layouts/navigation, folder/tag/not-found pages, backlinks/graph/search UI, client-side search on emitted index (per current TODO 45–48).

### Section 3 — CLI end-to-end

- CLI handoff injecting @svartz/vite into apps/web for build/dev; single-vault first, then svartz build:all and svartz dev; use vaults/docs as E2E verification target.

### Section 4 — Watch and HMR

- handleChange through pipeline and Vite dev path; watch mode/HMR after E2E runtime path works.

### Section 5 — Additional themes

- Add more default themes only after theme-minimal, @svartz/ui, and E2E runtime/dev loop are proven.

---

## Done criteria (Phase 1)

- NEXT_STEPS.md exists at repo root with exactly five sections and bullets matching Backlog content (no verbatim duplicates from TODO.md).
- TODO.md has no "Next plan queue" duplicate of NEXT_STEPS content; Active backlog trimmed so overlap with NEXT_STEPS is removed or reworded; SEO, docs, i18n, deferred remain.
- Grep confirms no open “theme resolution” or “theme requirements” question left in TODO.md.
- Verification step documented: re-read key files and note any drift from Verified state.

---

## Execution contract for Phase 2 (implementing NEXT_STEPS.md)

When implementing the content of NEXT_STEPS.md:

- Follow **Canonical pipeline order** and **Locked Contract** in this plan. Pipeline order is authoritative over any ordering implied only in NEXT_STEPS.md.
- parse-frontmatter: no link extraction. resolve-links: owns raw-link parse, slug map, resolve, and link rewrite. transform-description: owns description and title fallback. discover-files: owns include/exclude from config only.
- Add tests for new or moved behavior (word-count, link rewrite, discovery by pattern, mdsvex wrapper, MiniSearch); update existing tests when moving or inlining helpers.
- After plugin/helper moves, remove or deprecate unused exports from internal/parse and internal/resolve; keep fileToSlug and normalizeDateTime as shared.


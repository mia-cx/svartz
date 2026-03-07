---
name: next-steps backlog
overview: Create a separate high-priority `NEXT_STEPS.md` backlog that reflects the actual post-runtime architecture, verifies which plugin work is still stubbed, and trims overlapping items from `TODO.md` so the two files do not contradict each other.
todos:
  - id: tests
    content: "Tests: N/A — backlog-only change; verify correctness by re-reading the source files that prove plugin stubs and asset-discovery gaps before editing markdown."
    status: pending
  - id: capture-knowledge
    content: "Capture Knowledge: record the new execution order in `NEXT_STEPS.md` so future agents stop scattering these priority items across `TODO.md` and ad hoc plan queues."
    status: pending
  - id: documentation
    content: "Documentation: add `NEXT_STEPS.md` and reconcile `TODO.md` so the high-priority queue and broad backlog are both documented without overlap."
    status: pending
  - id: review-close
    content: "Review & Close: do a final pass for duplicate items, stale TODO entries, and any statement that contradicts the current runtime theme resolution or plugin status."
    status: pending
  - id: verify-status
    content: Verify the current source status of the transform plugins, runtime theme resolution, and asset discovery before making backlog edits.
    status: pending
  - id: write-next-steps
    content: Draft the new high-priority `NEXT_STEPS.md` with sections for markdown parity/embedding, theme-minimal + `@svartz/ui`, CLI E2E, watch/HMR, and later themes.
    status: pending
  - id: reconcile-todo
    content: Trim or rewrite overlapping items in `TODO.md`, including moving the current `Next plan queue` into the new file and folding related backlog items into the right section.
    status: pending
isProject: false
---

# Create Next-Steps Backlog

## Goal

Create a dedicated high-priority backlog file for the next implementation wave, while keeping `TODO.md` as the broader backlog. The new file will group the immediate work in the execution order you specified and only include items that are still genuinely unfinished.

## Verified Current State

- Markdown transform plugins are still explicit stubs in `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-ofm.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-ofm.ts)`, `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-gfm.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-gfm.ts)`, `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-toc.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-toc.ts)`, `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-syntax.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-syntax.ts)`, and `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-latex.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-latex.ts)`.
- The canonical core pipeline still includes those hooks in order in `[/Users/mia/mia-cx/svartz/packages/plugins/src/index.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/index.ts)`, so these are real backlog items rather than obsolete ideas.
- `[/Users/mia/mia-cx/svartz/packages/plugins/src/index-content.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/index-content.ts)` currently produces `entries`, `graph`, and `backlinks`, but does not yet build a MiniSearch-ready search artifact.
- `[/Users/mia/mia-cx/svartz/packages/plugins/src/internal/parse.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/internal/parse.ts)` still exports a tiny `extractFrontmatter()` wrapper, but its only live production usage is in `[/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts)`, and `packages/vault` is now considered defunct.
- `[/Users/mia/mia-cx/svartz/packages/plugins/src/internal/parse.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/internal/parse.ts)` still owns three behaviors that should live closer to their consuming plugins: `extractRawLinks()` should move into `[/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts)`, `extractDescription()` should be inlined into `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts)`, and `countWords()` should be replaced by a dedicated word-count plugin that runs after frontmatter parsing and before embedding.
- `[/Users/mia/mia-cx/svartz/packages/plugins/src/internal/resolve.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/internal/resolve.ts)` still owns `buildSlugMap()` and `resolveLink()` as shared helpers, but these should be treated as implementation details of `[/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts)`, not reusable cross-plugin utilities.
- Asset discovery does not yet honor the resolved config include patterns. `[/Users/mia/mia-cx/svartz/packages/plugins/src/discover-files.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/discover-files.ts)` still hard-filters to `.md` before checking the include globs, and its include/exclude behavior is partially split into shared ignore helpers that should instead be owned by discovery itself.
- Theme resolution is already runtime-owned by `@svartz/vite`, via `virtual:svartz/theme`, so that old TODO question is stale. Current runtime composition lives in `[/Users/mia/mia-cx/svartz/apps/web/src/lib/svartz/SvartzRuntimePage.svelte](/Users/mia/mia-cx/svartz/apps/web/src/lib/svartz/SvartzRuntimePage.svelte)`.
- Theme `requirements` and `capabilities` are metadata only. Themes are expected to satisfy their operational needs by shipping a `plugins[]` preset that `@svartz/vite` merges into the final plugin list; core plugin generation should not branch on theme metadata.

## File Changes

- Add a new top-level backlog file, proposed name: `[/Users/mia/mia-cx/svartz/NEXT_STEPS.md](/Users/mia/mia-cx/svartz/NEXT_STEPS.md)`.
- Update `[/Users/mia/mia-cx/svartz/TODO.md](/Users/mia/mia-cx/svartz/TODO.md)` so it stays broad and does not duplicate or contradict the new high-priority queue.

## New `NEXT_STEPS.md` Structure

### 1. Markdown Parity And Embedding

Move the immediate content-pipeline work here because it is verified as unfinished:

- Inline `extractFrontmatter()` into `[/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts)` and collapse any tests that only exist to preserve that tiny wrapper.
- Move `extractRawLinks()` ownership into `[/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts)`, since raw-link parsing exists to feed link resolution rather than general file discovery.
- Move `buildSlugMap()` and `resolveLink()` ownership into `[/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts)`, keeping them as plugin internals rather than shared helpers.
- Expand `[/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/resolve-links.ts)` so it both resolves internal markdown/wikilinks and rewrites them into runtime-safe output: plain `<a>` markup by default, or a configured Svelte link component when provided. That component contract must at least accept `href`.
- Inline `extractDescription()` into `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts)`, and make `transform-description` the sole owner of ensuring every file carries a final description value for downstream consumers.
- Move `deriveTitle()` ownership into `[/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/transform-description.ts)`, so title fallback/normalization is resolved there rather than in `index-content`.
- Replace `countWords()` with a dedicated word-count plugin that runs after `[/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/parse-frontmatter.ts)` and before embedding, so frontmatter and embedded-note content never contribute to word count.
- Scope that word-count plugin so it strips HTML comments (`<!-- -->`), markdown comments (`%% %%`), and HTML tag markup itself while still counting text content inside HTML elements; evaluate a library during implementation, but do not assume one is sufficient until it matches these markdown/html-specific rules.
- Real OFM transformer work.
- Real GFM transformer work.
- TOC extraction, explicitly scoped to the source note only and excluding embedded-note headings.
- Syntax highlighting plugin, explicitly scoped to Shiki and noting that the plugin options should expose Shiki configuration.
- LaTeX/math transformer work.
- Recursive markdown embedding/transclusion, including heading-targeted section transclusion.
- Add a MiniSearch index-builder step to `[/Users/mia/mia-cx/svartz/packages/plugins/src/index-content.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/index-content.ts)` so the canonical index plugin emits a search-ready artifact alongside `entries`, `graph`, and `backlinks`.
- Add a thin mdsvex compilation wrapper immediately before `[/Users/mia/mia-cx/svartz/packages/plugins/src/emit-artifacts.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/emit-artifacts.ts)` that turns the transformed markdown/HTML note content into Svelte artifacts and places those modules into the artifact bag for final materialization.
- Asset discovery and pass-through artifact emitters for images, audio, video, and PDFs.
- Attachment/image path rewriting and embed/link conventions, since you want `TODO.md` items `53-54` folded into OFM/embedder work.

### 2. Theme-Minimal And Shared UI

Create a second section that absorbs the current theme/UI/site-surface work:

- Build `@svartz/theme-minimal` against the existing theme contract.
- State that theme-specific behavior should come from `@svartz/plugins`, not ad hoc theme-exported plugins.
- State explicitly that theme `requirements` and `capabilities` remain metadata only; the actual enforcement mechanism is the theme’s own `plugins[]` preset merged by `@svartz/vite`.
- Define `@svartz/ui` as the shared theme-agnostic component package for `Link`, `TableOfContents`, `Breadcrumbs`, `FileTrie`, backlinks, graph, and search UI.
- Fold in current `TODO.md` items `45-48`, because the present `apps/web` shell already delegates layout/page rendering to the theme runtime.

### 3. CLI End-To-End Integration

Create a third section that makes the CLI the next verification gate:

- Implement the real CLI handoff into `apps/web` with `@svartz/vite`.
- Use `vaults/docs/` as the concrete end-to-end verification target.
- Include single-vault build/dev first, then multi-vault orchestration after the basic end-to-end loop works.

### 4. Watch Mode And Change Handling

Place this after end-to-end CLI integration, per your requested order:

- Implement `handleChange` through the pipeline and Vite dev path.
- Add watch mode/HMR after the end-to-end runtime path is working.

### 5. Additional Themes

Keep later theme work in its own final section:

- Add more default themes only after `theme-minimal`, the shared UI package, and the end-to-end runtime/dev loop are proven.

## `TODO.md` Cleanup Rules

- Remove or narrow items that are now promoted into `NEXT_STEPS.md` so the files do not compete.
- Move the existing `Next plan queue` items into the new file rather than keeping a second ad hoc high-priority list inside `TODO.md`.
- Keep broad backlog areas like SEO, docs, i18n, and deferred items in `TODO.md`.
- Fold `TODO.md` items `45-48` into the theme-minimal section and `53-54` into the markdown parity/embedding section.

## Verification Before Editing

When executing:

- Re-read `parse-frontmatter.ts` and `internal/parse.ts` and confirm `extractFrontmatter()` is still only a tiny wrapper before documenting the inline cleanup.
- Re-read `resolve-links.ts`, `transform-description.ts`, `index-content.ts`, and `internal/parse.ts` and confirm `extractRawLinks()`, `extractDescription()`, `deriveTitle()`, and `countWords()` still live outside their intended owning plugins before documenting the ownership split.
- Re-read `internal/resolve.ts` and confirm `buildSlugMap()` and `resolveLink()` are only serving `resolve-links`, then document their move into that plugin.
- Re-read `discover-files.ts` and `internal/ignore.ts` and confirm include/exclude filtering is still split between discovery and shared helpers before documenting that ownership cleanup.
- Confirm the current pipeline order in `[/Users/mia/mia-cx/svartz/packages/plugins/src/index.ts](/Users/mia/mia-cx/svartz/packages/plugins/src/index.ts)` and capture the new sequencing requirements: word count runs after frontmatter parsing and before embedding; TOC reflects only source-note headings; mdsvex note compilation happens immediately before artifact emission.
- Re-read the five transform plugin files and confirm they still contain only MVP stub bodies.
- Re-read `index-content.ts` and confirm it still stops at `entries`, `graph`, and `backlinks` before documenting the MiniSearch builder as unfinished work.
- Re-read `discover-files.ts` and confirm it still hardcodes `.md` instead of using the resolved include patterns before documenting the asset gap.
- Re-read `SvartzRuntimePage.svelte` to ground the claim that the app shell is thin and theme-owned UX belongs under `theme-minimal`.
- Re-read the theme contract and Vite merge path as needed and confirm `requirements`/`capabilities` are metadata only, while theme `plugins[]` remains the operational path.

## Done Criteria

- `NEXT_STEPS.md` exists and is clearly organized by the requested execution order.
- Every item in the new file is verified unfinished, not already implemented.
- `TODO.md` no longer duplicates the promoted high-priority queue or stale theme-resolution questions.
- The asset-discovery gap is explicitly captured in the new file, along with the pass-through asset-emitter follow-up.
- The Shiki-configurable syntax-highlighting requirement and recursive section transclusion requirement are both spelled out explicitly.
- The new high-priority queue explicitly calls out the MiniSearch index-builder follow-up in `core:index`.
- The new high-priority queue explicitly calls out the `extractFrontmatter()` inline cleanup in `parse-frontmatter`.
- The new high-priority queue explicitly captures the parse-helper ownership cleanup and the dedicated post-frontmatter word-count plugin with its markdown/html stripping rules.
- The new high-priority queue explicitly captures config-driven discovery, resolve-links-owned link parsing/slug mapping/link rewriting, metadata-only theme requirements, source-note-only TOC behavior, and the thin mdsvex wrapper step before `emit-artifacts`.


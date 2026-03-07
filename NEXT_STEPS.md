# Next Steps

High-priority implementation backlog. Execution order and ownership are defined in `.cursor/plans/next-steps_backlog_f737af77.plan.md` (Locked Contract, Canonical pipeline order).

---

## 1. Markdown parity and embedding

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

## 2. Theme-minimal and shared UI

- Build theme-minimal against the theme contract; theme-specific behavior via plugins in theme plugins[] merged by @svartz/vite; requirements/capabilities metadata only.
- @svartz/ui: shared theme-agnostic components — Link, TableOfContents, Breadcrumbs, FileTrie, backlinks, graph, search (bar + modal). Consumed by theme-minimal and other themes.
- Real note layouts/navigation, folder/tag/not-found pages, backlinks/graph/search UI, client-side search on emitted index (per current TODO 45–48).

## 3. CLI end-to-end

- CLI handoff injecting @svartz/vite into apps/web for build/dev; single-vault first, then svartz build:all and svartz dev; use vaults/docs as E2E verification target.

## 4. Watch and HMR

- handleChange through pipeline and Vite dev path; watch mode/HMR after E2E runtime path works.

## 5. Additional themes

- Add more default themes only after theme-minimal, @svartz/ui, and E2E runtime/dev loop are proven.

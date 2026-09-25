# Emit artifacts

`core:emit-artifacts` provides the required `emitArtifacts` stage. It writes vault-scoped page components and runtime index modules under the generated artifacts directory. `ctx.index` must already exist. The Vite artifact module imports the active compiler resources and exposes the index, graph, search, and page components to SvelteKit.

`.svx` notes compile with mdsvex and may contain authored Svelte. `.md` and `.mdx` compile as Markdown into inert HTML in a Svelte page component. The emitter uses only remark and rehype plugins contributed by active transform hooks. It does not add math, syntax, or GFM itself.

The artifact set is rebuilt for each run, so removed notes and feature resources leave the output. The emitter runs after indexing and must not write into `apps/web/src/routes`. See [[guides/runtime-vite-integration]].

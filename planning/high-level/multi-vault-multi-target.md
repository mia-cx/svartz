# Multi-vault + multi-target (design idea)

**Status:** Idea — not in initial scope; consider after single-vault flow is solid.

## Concept

- **`vaults/` directory:** Users can add multiple vaults (e.g. `vaults/docs/`, `vaults/notes/`, `vaults/playground/`), each an Obsidian-style folder of `.md` and assets.
- **Config selects which vault(s) to build** and **where each deploys**:
  - **Same site, different root paths:** e.g. vault `docs` → `https://site.com/docs/`, vault `notes` → `https://site.com/notes/`.
  - **Different targets entirely:** e.g. vault `docs` → GitHub Pages at `user.github.io/repo`, vault `api-docs` → Cloudflare Workers at `api-docs.example.com`, or separate subdomains / static hosts per vault.

## Benefits

- One repo, many “sites” or sections (docs, blog, wiki, playground).
- Clear separation of content (vaults) from build/deploy rules (config).
- Power users can push different vaults to different platforms without multiple repos.

## Config shape (sketch)

```ts
// svartz.config.ts (conceptual)
vaults: {
  sourceDir: 'vaults',           // dir containing vault subdirs
  build: ['docs', 'notes'],      // which vaults to build (or * for all)
  targets: [
    { vault: 'docs', basePath: '/docs', adapter: 'static', output: 'build/docs' },
    { vault: 'notes', basePath: '/', adapter: 'static', output: 'build' },
    { vault: 'api-docs', basePath: '/', deploy: { type: 'cloudflare-pages', project: 'api-docs' } },
  ],
}
```

(Exact schema TBD; adapters and deploy targets would need to be designed.)

## Open questions

- Single SvelteKit app with multiple prerender roots vs. multiple build outputs (or separate apps) per target.
- Cross-vault links / graph (or keep vaults isolated).
- How CI “deploy this vault to this target” maps to workflow jobs and secrets (e.g. one job per target, or one build with multiple upload steps).

## Relation to current plan

- TODO lists “Multi-vault support” as a **non-goal initially**. This doc is the desired end state for that feature.
- Start with single vault + single deploy target; introduce `vaults/` and multi-target config once the pipeline and CLI are stable.

# First steps — broad plan

High-level sequence before diving into M0. Align here, then implement.

---

## 1. Monorepo + Quartz as reference

**Goal:** Repo root becomes a Turborepo monorepo; current Quartz code lives in a reference folder for consultation only.

| Step   | What                                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1a** | Move existing Quartz tree into **`reference/quartz/`**. Include `quartz/`, `quartz.config.ts`, `quartz.layout.ts`, `docs/` (Quartz docs), and any root files that are purely Quartz (e.g. `index.d.ts`). Optionally keep `README.md` at root and add a short “This is the Svartz rewrite; see `reference/quartz` for original Quartz.” |
| **1b** | Add **monorepo root**: `package.json` (workspaces), `pnpm-workspace.yaml`, `turbo.json`, root `tsconfig.json` (references). Use pnpm.                                                                                                                                                                                                  |
| **1c** | Create **`apps/site/`** — SvelteKit app (scaffold with `pnpm create svelte@latest`). Configure for static adapter + prerender.                                                                                                                                                                                                         |
| **1d** | Create **`packages/`** placeholders as in TODO: `content-pipeline/`, `markdown/` (and optionally `themes/`). Each has its own `package.json` and minimal exports so Turborepo can build them.                                                                                                                                          |
| **1e** | Add **`vault/`** — small fixture vault (a few `.md` files with wikilinks) for development and tests.                                                                                                                                                                                                                                   |

**Result:** Root is Turborepo; Svartz app and packages live under `apps/` and `packages/`; Quartz is read-only under `reference/quartz/`.

**Open choice:** Keep `reference/quartz` as an in-repo copy (current code moved once) vs. a **git submodule** pointing at `jackyzha0/quartz` at v4 tag. Submodule = cleaner upstream reference and easy `git pull` updates; in-repo copy = no submodule management and everything in one clone. Recommend **in-repo copy** for simplicity unless you want to track upstream Quartz changes often.

---

## 2. Config and conventions (from TODO §0)

Decide early so M0 doesn’t block:

| Decision        | Options                                             | Suggested                                                            |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| **Vault root**  | `vault/` at repo root vs. configurable path         | `vault/` at repo root by default; allow override in config.          |
| **Config file** | Reuse `quartz.config.ts` vs. new `svartz.config.ts` | New **`svartz.config.ts`** to avoid confusion and allow a clean API. |
| **Adapter**     | Default static only vs. document multiple           | Default **`adapter-static`**; document Node/Cloudflare later.        |

No need to implement full config in step 1; just agree so the SvelteKit app and pipeline can assume “vault at `vault/`” and “config will live in `svartz.config.ts`”.

---

## 3. M0 spike (after monorepo exists)

Once the layout is in place:

- **M0** (from TODO): Lock in mdsvex; prove vault read → resolve wikilinks → prerender one note with a Svelte layout; prove plugin shape with one trivial plugin (e.g. reading time).
- Implement inside **`apps/site`** + **`packages/content-pipeline`** and **`packages/markdown`** as needed; reference `reference/quartz/` for parsing/transforms/graph/search when implementing.

---

## 4. Suggested order of work

1. **Move Quartz to `reference/quartz/`** (mv/cp), then fix any paths in `reference/quartz` so its scripts still run from `reference/quartz` if we ever need to run them (optional).
2. **Scaffold monorepo** at root: pnpm workspaces, Turborepo, root tsconfig.
3. **Scaffold `apps/site`** (SvelteKit, static adapter).
4. **Add package stubs**: `packages/content-pipeline`, `packages/markdown`, then `vault/` with 2–3 fixture notes.
5. **Lock decisions**: vault root, `svartz.config.ts` name, adapter default (document in README or `docs/`).
6. **Start M0** in `apps/site` + content-pipeline + markdown.

---

## 5. What to leave at repo root (after move)

- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`
- `README.md` (point to Svartz, reference/quartz, and how to run the app)
- `TODO.md`, `docs/PLAN-first-steps.md`
- `.gitignore`, `.node-version`, lint/format config
- `vault/`
- `apps/`, `packages/`
- `reference/quartz/` (entire current Quartz tree)

---

## Next

If this matches your intent, next move is **execute 1a (move Quartz into `reference/quartz/`)** and **1b (monorepo root)**, then 1c–1e. I can outline the exact commands and file moves for 1a and 1b next.

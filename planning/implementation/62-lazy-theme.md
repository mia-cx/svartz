# #62 Lazy theme route imports

A lazy theme page importing `@svartz/ui` stalls SvelteKit's chunk rendering. Preserve SSR, hydration, static and host builds without requiring eager page modules.

- [x] Tests: lazy `TagPage` reproduced the stall; static, host, hydration, and packed consumers pass.
- [x] Reproduce and minimize the Vite module graph or chunk cycle. Top-level theme materialization stalls SSR chunk rendering when a lazy page imports a shared package.
- [x] Fix the runtime cycle with a `ready` promise and live theme exports; eager and lazy fallback behavior remains.
- [x] Capture Knowledge: record the import boundary and build constraint in a scoped rule.
- [x] Documentation: update the theme author contract with a working lazy page example.
- [x] Review & Close: inspect output, run focused/full checks, and file a stacked PR.

Worktree: `fix/62-lazy-theme`, stacked on #69. Opus's UI worktree is separate.

# Reload edited ESM configuration

Issue #83 fixes stale `.mjs` and ESM `.js` configs when one process calls `loadConfig` again.

- [ ] Tests: change the same `.mjs` and ESM `.js` files between loads; keep CommonJS and TypeScript loading covered.
- [ ] Capture knowledge: record that Jiti's module cache option does not bypass Node's native ESM cache.
- [ ] Documentation: state the supported reload behavior and native ESM selection.
- [ ] Review & close: inspect the diff, run config tests/build, and resolve the original review thread. Close #83 only when merged.

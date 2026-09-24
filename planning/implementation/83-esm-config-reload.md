# Reload edited ESM configuration

Issue #83 fixes stale `.mjs` and ESM `.js` configs when one process calls `loadConfig` again.

- [x] Tests: change the same `.mjs`, ESM `.js`, and `.ts` files between loads; cover CommonJS and top-level await. Config tests pass.
- [x] Capture knowledge: record that Jiti's module cache option does not bypass Node's native ESM cache.
- [x] Documentation: state the supported reload behavior and native ESM selection.
- [ ] Review & close: inspect the diff, run config tests/build, and resolve the original review thread. Close #83 only when merged.

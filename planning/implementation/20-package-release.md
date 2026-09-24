# #20 Package release preparation

## Outcome

The seven public packages pack into usable archives. A project outside the monorepo can install the archives, run `svartz init`, build, and develop. Publication itself is a separate release action.

## TODOs

- [x] Finalize package names, versions, dependencies, engines, exports, license, and archive contents.
- [x] Validate the packed CLI in fresh and existing SvelteKit consumers.
- [x] Document a repeatable release check and package publication order.
- [x] Tests: workspace build, 16 test tasks, and packed fresh/Vite 8 host install, build, and dev checks passed.
- [x] Capture Knowledge: record pnpm workspace dependency conversion and release order in a scoped rule.
- [x] Documentation: explain consumer requirements and the release process.
- [ ] Review & Close: inspect the full diff, confirm checks, and file a stacked PR for #20.

## Notes

- Base branch: `feat/v1-multi-vault-host` (PR #54).
- Public npm publication is outside this issue's authorized actions.
- Mia selected MCX v1.0 for all seven v1 packages. Each package now carries the repository license in its archive and uses npm's custom-license metadata format.

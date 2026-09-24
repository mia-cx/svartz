# #20 Package release preparation

## Outcome

The seven public packages pack into usable archives. A project outside the monorepo can install the archives, run `svartz init`, build, and develop. Publication itself is a separate release action.

## TODOs

- [ ] Finalize package names, versions, dependencies, engines, exports, and archive contents.
- [x] Validate the packed CLI in fresh and existing SvelteKit consumers.
- [x] Document a repeatable release check and package publication order.
- [x] Tests: workspace build, 16 test tasks, and packed fresh/Vite 8 host install, build, and dev checks passed.
- [x] Capture Knowledge: record pnpm workspace dependency conversion and release order in a scoped rule.
- [x] Documentation: explain consumer requirements and the release process.
- [ ] Review & Close: inspect the full diff, confirm checks, and file a stacked PR for #20.

## Notes

- Base branch: `feat/v1-init-scaffold` (PR #43).
- Public npm publication is outside this issue's authorized actions.
- License metadata still says MIT in five packages, while the repository LICENSE says MCX v1.0. Asked Mia which applies to the v1 packages before finalizing archives.

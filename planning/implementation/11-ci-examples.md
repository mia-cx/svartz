# #11 CI workflow examples

## Outcome

People who scaffold a Svartz site can copy a small GitHub Actions workflow without cloning the monorepo. Maintainers can run the workspace build and browser tests from CI. Neither example deploys anything.

## TODOs

- [x] Write a copyable npm workflow for a standalone or existing SvelteKit app.
- [x] Document the pnpm/Turbo workspace workflow and correct the stale cache assumptions in the old planning note.
- [x] Tests: both YAML examples parsed and the workspace Playwright command resolved. No product logic changed, so no build/test rerun is needed.
- [x] Capture Knowledge: the old planning note now points to the canonical guide and records immutable cache behavior.
- [x] Documentation: README links the guide; the guide names standalone and host output ownership.
- [ ] Review & Close: inspect the final diff and file a PR that closes #11.

## Notes

- Base branch: `feat/v1-init-scaffold` (PR #43). Package publication remains #20; canonical docs deployment remains #1.
- GitHub's current setup-node caches package-manager stores, not `node_modules`. Actions caches cannot be updated under one constant key. The older `planning/cli-turbo-orchestration.md` claim needs correction.

# #39 Support host SvelteKit app roots

## Outcome

The CLI builds a configured vault in an existing SvelteKit application without requiring `apps/web` or changing its routes, adapter, scripts, or `.svelte-kit` directory. Repository vault builds retain their current isolation.

## TODOs

- [x] Tests: add a host fixture that exercises root detection, preserved files, adapter output, and route compilation.
- [x] Detect host roots and pass the actual project root through CLI build, dev, preview, and watcher setup.
- [x] Preserve host scripts, adapter, and `.svelte-kit`; isolate only Svartz-owned generated files.
- [x] Capture Knowledge: record host-root and generated-workspace rules.
- [x] Documentation: add host CLI usage and retain the separate `init` requirement.
- [x] Review & Close: full build, 16 workspace test tasks, 12 focused CLI tests, and docs static build passed; diff inspected for the stacked PR.

Repository-wide lint stops in the unchanged `apps/web` Tailwind formatter: it cannot resolve `virtual:svartz/tailwind-sources.css` while checking that app.

## Constraints

Do not change host routes or create UI. `svartz init` remains #18. The shared content API and multi-vault host mounts remain later implementation gates.

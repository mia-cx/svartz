# #18 Initialize a project in the current directory

## Outcome

`npx svartz@latest init` creates a usable Svartz site in the invocation directory, or adds vault configuration to an existing SvelteKit app. The command never clones the repository or overwrites existing files.

## TODOs

- [x] Tests: empty, existing Kit, configured, and conflict cases pass. Packed packages built, served, and previewed a fresh site outside this repository; a packed CLI integrated an existing Kit app.
- [x] Add a package-owned small SvelteKit shell with the shared runtime renderer, minimal theme, config, and starter vault.
- [x] Implement `init` with current-directory ownership, package-manager detection, dependency installation, optional Git setup, and safe existing-app integration.
- [x] Capture Knowledge: record scaffold ownership, package assets, and consumer commands.
- [x] Documentation: replace stale first-run instructions with the actual `npx` flow.
- [x] Review & Close: full build, 16 workspace test tasks, and docs static build passed; inspect the packed packages and diff for a stacked PR.

Packed validation used temporary local tarballs because public npm publication belongs to #20. The packed fresh site passed npm install, build, dev HTTP 200, and preview HTTP 200. The packed existing Kit app kept its portfolio route, compiled its Svartz metadata route, and used its own static adapter. The repository's unrelated `apps/web` lint formatter and bare `svelte-check` failures remain as recorded in #39 and #41.

## Constraints

Keep themes and plugin management commands out of v1. Config `vaults[].path` remains the source of truth for content on disk. An existing host retains its routes, layouts, Vite config, adapter, and build scripts. Public npm publication belongs to #20.

# #45 Allocate canonical routes and redirects

## Outcome

Published notes receive deterministic canonical URLs. Natural filenames and host routes have priority. Alias and permalink redirects only claim unused URLs. The index carries final URLs for consumers.

## TODOs

- [x] Tests: cover collisions, exact links, publication order, aliases, mounts, manual routes, and repeat builds.
- [x] Implement route allocation after publication filtering, then make links and the index consume allocated paths.
- [x] Wire mount paths and host route precedence into the runtime and generated entries.
- [x] Capture Knowledge: update scoped plugin rules with the route allocation lifecycle.
- [x] Documentation: describe mounts, collision rules, and redirects for host apps.
- [x] Review & Close: run package and workspace checks, inspect generated output, and file a stacked PR.

## Constraints

Use the accepted decisions in #31. The deployment base and vault mount are independent. Manual SvelteKit routes win through route specificity. Every URL must have one owner; unresolved links stay out of the graph.

## Validation

- Workspace build and all 16 workspace test tasks passed after the final changes.
- Focused config, plugin, Vite, host, and browser runtime suites passed during implementation.
- The docs static build passed and emitted folder routes needed by breadcrumbs. The host test built and served a mounted note beside a manual SvelteKit page, verified an alias redirect, and checked a 404.
- `apps/web` bare `svelte-check` still reports the pre-existing duplicate-Vite and generated-Paraglide type errors. No error remains in the changed route files.
- Multi-vault host composition is #51. This slice covers one selected vault per host build.
- PR #52 is open on `feat/v1-init-scaffold`.

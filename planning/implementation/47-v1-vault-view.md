# #47 Typed vault view for hosts and themes

## Outcome

Hosts and themes read one published vault through a typed view. Notes expose final URLs, properties, page controls, TOC, links, graph, and backlinks. Search uses the same indexed fields in its producer and browser consumer.

## TODOs

- [x] Tests: verify typed note lookup, URL composition, search schema, and SvelteKit runtime fixture.
- [x] Implement a small pure vault view in core and export it through the virtual artifacts module.
- [x] Wire search and built-in navigation to final hrefs, including deployment base and mount.
- [x] Capture Knowledge: document the vault view as the host/theme data contract.
- [x] Documentation: show a host loader and note page controls.
- [x] Review & Close: run focused and workspace checks, inspect the built host behavior, and file a stacked PR.

## Constraints

Use the approved contract in #32 and canonical URLs from #45. No unpublished note content enters the view. Theme visual design remains with Mia and Opus 5.5.

The original #47 also covered resource cleanup and two-vault isolation. Those are now tracked in #48 and #51. The issue body was updated before filing this PR.

Validation: `pnpm build` passed (7 tasks); `pnpm test` passed (16 tasks); the docs static build passed; focused core, Vite, UI navigation, and web runtime tests passed. Svelte checks still report only the existing duplicate Vite type and missing Paraglide fixture errors.

# #41 Export the standalone runtime page

## Outcome

A generated SvelteKit shell can import the same vault page renderer used by the repository site from an installed Svartz package.

## TODOs

- [x] Tests: the existing route and SSR tests now import the package export; the packed archive includes the component and declaration files.
- [x] Move the runtime page to `@svartz/ui/runtime` and make the repository shell import it.
- [x] Capture Knowledge: record package ownership and consumer route responsibilities.
- [x] Documentation: document the import expected by the standalone shell.
- [x] Review & Close: package build, 16 workspace test tasks, and docs static build passed; inspect the archive and diff for a stacked PR.

`svelte-check` still fails in the unchanged Vite configs because pnpm resolves two Vite type instances with different `@types/node` peers. The web app also reports missing generated Paraglide modules during a bare check. Neither failure comes from the moved renderer.

## Constraints

Keep the route files as the consumer-owned shell. Do not change their URL behavior or the theme renderer's output in this slice. The initializer and npm publication remain #18 and #20.

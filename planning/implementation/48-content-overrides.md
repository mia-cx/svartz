# #48 Content overrides and lazy theme SSR

## Outcome

Host apps can override the five content component slots, themes provide the next choice, and built-in renderers cover the rest. Theme modules resolve before SSR so prerender and hydration agree.

## TODOs

- [x] Resolve lazy theme layouts, routes, and component entries before SSR, with manifest validation and tests.
- [x] Add typed content component props and host registration with host, theme, built-in precedence.
- [x] Render inert Markdown through overridable callout, code, image, link, and embed slots without changing `.svx` execution rules.
- [x] Give browser scripts a mount/dispose lifecycle across navigation and repeated mounts.
- [x] Tests: cover static and host SSR, override precedence, Markdown inertness, resource disposal, and 404 behavior. A lazy tag page with a UI import remains in #62; hydration in a packed host is pending the release check.
- [x] Capture Knowledge: record the runtime component and browser resource contracts in scoped rules.
- [x] Documentation: update theme and host guides with real manifest keys and `.svx` examples.
- [x] Review & Close: inspected the diff, ran focused and workspace checks, and prepared a PR closing the narrowed #48 scope. #62 remains open.

## Notes

Base: `feat/v1-images` (PR #61). Issue #48 owns backend only; visual theme work stays in #21.

Focused core, plugin, UI, and Vite tests pass. All 16 workspace test tasks, the static docs build, seven public archive checks, and packed fresh/Vite 8 host build and dev checks pass with a lazy not-found component. A lazy tag page stalls Vite chunking even with a navigation-only UI import; #62 tracks that follow-up. Final attribute normalization passed 98 plugin tests and UI type checks.

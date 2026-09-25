# #22 Verify theme resolution across build and dev

## Outcome

Installed, project-relative, and absolute theme references resolve from the right directory. The CLI and Vite share package-root discovery. The built-in theme remains the default; an invalid configured theme fails clearly. Local theme edits restart dev with the right build filter.

## TODOs

- [x] Tests: cover all three reference forms, missing themes, and local dev watch descriptors.
- [x] Normalize relative theme paths against the config directory, share root resolution, and fix local/external watch behavior.
- [x] Capture Knowledge: record the theme path and restart ownership rule.
- [x] Documentation: replace the obsolete theme-resolution plan with the verified contract.
- [x] Review & Close: run focused and workspace checks, review the diff, and file a stacked PR.

## Constraints

Keep the built-in default in `@svartz/config`. Do not add theme management CLI commands. Theme design and UI components remain separate.

## Validation

- Config, Vite, and CLI focused tests cover default, npm, relative, absolute, missing, and dev watch cases.
- The workspace build and all 16 test tasks passed.
- The isolated docs static build passed with no broken-anchor warnings.

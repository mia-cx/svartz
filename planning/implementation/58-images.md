# #58 Social images and favicon variants

## Outcome

Published notes get build-time social images from a theme template. Explicit note images and site fallbacks take priority. Standalone vaults get theme-default favicon variants; hosts opt in.

## TODOs

- [x] Add typed theme, config, and index contracts for social images and favicon sources.
- [x] Implement an owned image emitter with publication-safe per-note PNG output and cleanup.
- [x] Decode SVG, PNG, JPEG, WebP, and ICO favicon inputs and emit appropriate favicon variants.
- [x] Tests: cover override precedence, protected notes, five input formats, static/host outputs, and stale cleanup.
- [x] Capture Knowledge: record image ownership, metadata bounds, and host opt-in in a scoped rule.
- [x] Documentation: show theme template, note override, fallback, favicon config, and generated URLs.
- [x] Review & Close: inspected diff, ran relevant tests/builds and packed consumer checks, and prepared PR closing #58.

## Notes

Base branch: `feat/v1-listings` (PR #60). `sharp` decodes common raster inputs and SVG; ICO needs its own decoder. The generator runs after indexing and before the index artifact is serialized. Theme visuals remain replaceable by the theme author.

Validation: final full workspace test 16/16, static and host end-to-end builds, package build 7/7, seven archive release checks, packed fresh static and Vite 8 host consumers. Focused image emitter and Vite watcher tests passed after final changes.

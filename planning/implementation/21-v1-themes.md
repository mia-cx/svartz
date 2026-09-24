# #21 Svartz v1 themes

## Outcome

Five first-party themes share one Svartz design language: minimal (Quartz layout and features), wiki, blog, docs, and api-docs. References shape structure and features only. Shared rendering and behaviour live in `@svartz/ui`; themes set density, scale, measure, and layout.

## TODOs

- [ ] PR 0 — Design language: `DESIGN.md`, `@svartz/ui` `tokens.css` (OKLCH neutrals, accent, signal hues, type, space, shape, motion), self-hosted fonts, wordmark and favicon, specimen route in the `@svartz/ui` showcase. **Gate: Mia signs off before themes build on it.**
- [ ] PR 1 — OFM layer in `@svartz/ui`: `Callout`, `CodeBlock`, `Link`, `Embed` content slots; `ofm.css`; colour-mode script and toggle; `createSearch`; `fetchPreview`; `formatDate`; `syntaxPreset`. Kitchen-sink `vaults/showcase`.
- [ ] PR 2 — `theme-minimal`: Quartz layout and features.
- [ ] PR 3 — `theme-wiki`.
- [ ] PR 4 — `theme-blog`.
- [ ] PR 5 — `theme-docs`.
- [ ] PR 6 — `theme-api-docs`.
- [ ] Tests: focused unit tests for shared helpers and each theme's pure logic; `materializeTheme` per theme.
- [ ] Capture Knowledge: `.cursor/rules/theme-styling.mdc`.
- [ ] Documentation: `DESIGN.md`, theme READMEs, `vaults/docs/guides/create-theme.md`.
- [ ] Review & Close.

## Notes

Plan of record: `~/.claude/plans/resilient-brewing-creek.md`. Harness branch `t3code/minimal-theme-quartz-port` on `feat/v1-encrypted-svx` (35bd9549).

Quartz v4.5.2 reference source: `packages/reference/quartz/`.

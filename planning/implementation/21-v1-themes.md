# #21 Svartz v1 themes

## Outcome

Five first-party themes share one Svartz design language: minimal (Quartz layout and features), wiki, blog, docs, and api-docs. References shape structure and features only. Shared rendering and behaviour live in `@svartz/ui`; themes set density, scale, measure, and layout.

## TODOs

- [x] PR 0 — Design language: `DESIGN.md`, `@svartz/ui` `tokens.css` (OKLCH neutrals, accent, signal hues, type, space, shape, motion), self-hosted fonts, wordmark and favicon, specimen route in the `@svartz/ui` showcase. **Gate moved: Mia signs off on PR 0 + minimal together, before wiki/blog/docs/api-docs.**
- [x] PR 1 — OFM layer in `@svartz/ui`: `Callout`, `CodeBlock`, `Link`, `Embed` content slots; `prose.css`; colour-mode script and toggle; `SearchDialog`; `LinkPreviews`; `formatDate`; `svartzSyntax`. Kitchen-sink `vaults/showcase`.
- [x] PR 2 — `theme-minimal`: Quartz layout and features.
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

Pipeline bugs fixed along the way (2d42eaed): rehype-raw dropped code-fence meta; the code figure check missed rehype-pretty-code's kebab-case key, so a bare `<pre>` became the slot and lost its whitespace; section embeds joined Markdown into an HTML block and inlined raw, unresolved source. Dev watcher restart loop on generated Paraglide files (126c8a04).

Visual QA: Chromium via Playwright + CDP focus emulation (`~/.cache/svartz-shots.mjs`), 1440/1024/390px, light and dark; keyboard pass for tab order, search (Esc, Enter, focus return). Run one heavy process at a time: this VM has 9 GB.

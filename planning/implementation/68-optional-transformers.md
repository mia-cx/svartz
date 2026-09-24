# #68 Optional v1 content formats

Add disabled-by-default first-party plugins for Quartz's optional authoring formats. Keep ordinary Markdown unchanged when no plugin is configured.

- [x] Tests: each optional plugin renders representative source and stays disabled unless configured. A protected SVX fixture compiles citations without unused bibliography entries; the existing public/protected CLI fixtures pass.
- [x] Hard line breaks and Roam format plugins with focused fixtures.
- [x] OxHugo source normalization before frontmatter/link parsing, with a focused fixture.
- [x] Citation rendering with a local bibliography and configurable style/link options.
- [x] Capture Knowledge: record stage choice, dependency paths, and rebuild behavior in plugin rules.
- [x] Documentation: show configuration and format boundaries.
- [x] Review & Close: plugin, CLI, static/host, and packed-consumer checks passed; stacked PR #69 is filed on #67.

The local Quartz 4.5.2 reference in `packages/reference` defines the optional feature subset. V1's agreed English UI lets citations use the package's local English locale.

Validation: 130 plugin tests and 28 serial CLI tests pass. Seven workspace builds pass with Turbo concurrency 1. `node scripts/check-release.mjs` packs all seven packages, imports the four optional factories from an outside project, and passes fresh static/dev plus Vite 8 host type/build/dev checks. The optional plugins only run when configured in a vault.

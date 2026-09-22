# Quartz capability baseline and Svartz v1 gaps

Research date: 2026-09-22. Decision ticket: [Establish the Quartz capability baseline and Svartz gaps](https://github.com/mia-cx/svartz/issues/27).

Svartz already has the main build/runtime architecture. Quartz parity still requires substantial authoring, publication, resource, and distribution work.
The upstream baseline has also moved. Quartz 5 is tagged, and its current documentation includes capabilities absent from the bundled Quartz 4 reference.

## Evidence and version boundary

| Baseline | Immutable revision | What this establishes |
| --- | --- | --- |
| Svartz MVP | [`358f6537`](https://github.com/mia-cx/svartz/tree/358f6537) | Code inspected, including the unmerged MVP branch. Presence below means source exists, not that this audit ran it. |
| Bundled Quartz reference | [Svartz `packages/reference`](https://github.com/mia-cx/svartz/tree/358f6537/packages/reference) | Package declares `4.5.2`. Last reference change is Svartz `40b1feabcd2973409e56cf9a47769a58dcc90080`, dated 2026-03-07. Exact upstream provenance is unverified; version text does not establish byte-for-byte tag identity. |
| Latest v4 tag observed | [`v4.5.2`, `4923affa7722dfc751f1074348e6dad214fe0c08`](https://github.com/jackyzha0/quartz/tree/4923affa7722dfc751f1074348e6dad214fe0c08) | Annotated tag dated 2025-09-21. Distinct from v4 branch head `d25a6eabf96751ffca56f8a8139272def7a65041`. |
| Latest version tag observed | [`v5.0.0`, `ab346fa66a895e12d63a308e70ce330ba795822a`](https://github.com/jackyzha0/quartz/tree/ab346fa66a895e12d63a308e70ce330ba795822a) | Annotated tag dated 2026-03-14; package version `5.0.0`. Read tagged docs and core source separately from current development. |
| Current upstream default branch | [`v5`, `97a2d05f80c4c50534959b1d0d41cc4b3895625e`](https://github.com/jackyzha0/quartz/tree/97a2d05f80c4c50534959b1d0d41cc4b3895625e) | Commit dated 2026-09-20. Current website describes this generation, including later additions. |

GitHub's release API still reports `v4.0.8` as the latest Release entry. It is not the newest Git tag.
The [tag references](https://api.github.com/repos/jackyzha0/quartz/git/refs/tags) and [Release entries](https://api.github.com/repos/jackyzha0/quartz/releases) distinguish those records.

Quartz 5 moves most implementations into independently versioned `quartz-community` repositories.
Its core tag pins the documentation, loader, and defaults, but does not alone pin every external plugin's behavior.
This audit treats v5 plugin behavior as **documented**, not independently runtime-verified against historical plugin commits.
Before implementation acceptance tests, pin the selected external plugin revisions or package versions where exact behavior matters.
Sources: [tagged plugin catalog][q5-catalog], [tagged authoring instructions][q5-authoring], [current plugin loader][q5-loader].

## All bundled first-party transformers and filters

The bundled reference exports 13 transformers and two filters. Svartz exports 13 core plugins total, with different responsibilities.
Parity concerns observable behavior and configurable capabilities; it does not require Quartz's hook names or pipeline order.
Sources: [reference transformer exports][q4-transformers], [reference filter exports][q4-filters], [Svartz plugin exports][s-plugins].

| Quartz capability | Svartz MVP evidence | Remaining backend specification |
| --- | --- | --- |
| FrontMatter | YAML parsing, configurable canonical field names, title/description fallback exist. | TOML/custom delimiters; singular/plural aliases; scalar/list normalization; permalink, CSS classes, language and page-control metadata. Malformed frontmatter currently loses its block and returns no metadata. Define diagnostics and publication consequences. [Parsing][s-parse], [Quartz fields][q4-frontmatter]. |
| CreatedModifiedDate | Index prefers configured frontmatter dates, then filesystem dates, then epoch. | Configurable Git/frontmatter/filesystem precedence; portable dates after fresh checkout; publication date separate from publication permission. [Index][s-index], [Quartz dates][q4-dates]. |
| SyntaxHighlighting | Emitter runs `rehype-pretty-code` with one hardcoded dark theme. The named transformer is empty. | Real plugin ownership, options, light/dark themes, disabling, code titles/line highlighting, browser resource requirements. [Emitter][s-emit], [stub][s-syntax], [Quartz syntax][q4-syntax]. |
| ObsidianFlavoredMarkdown | Comments, highlights and callout markers exist; links and embeds use separate stages. | Inline/nested tags; block IDs; diagram resources; image dimensions; functional folding; HTML embeds, arrows, video/YouTube behavior, optional interactive tasks and broken-link treatment. Details below. [OFM][s-ofm], [Quartz OFM][q4-ofm]. |
| GitHubFlavoredMarkdown | Registers `remark-gfm`; emitter adds heading IDs and anchors. | Configurable smart typography and heading links; verify footnotes, escaped tables and disabled-plugin behavior across compilation. [GFM][s-gfm], [Quartz GFM][q4-gfm]. |
| TableOfContents | Source heading extraction exists before embeds. | Options for depth/minimum entries/default visibility/collapse and per-note override; rendered heading IDs must match duplicate, formatted and Setext headings. [TOC][s-toc], [parser][s-parse], [Quartz TOC][q4-toc]. |
| CrawlLinks | Aliases, three resolution strategies, note/asset rewriting and graph links exist. | AST-safe extraction; same-note/block anchors; escaped/encoded paths; external-link metadata; media URLs; consistent routes/base paths and ambiguity reporting. [Links][s-links], [Quartz links][q4-links]. |
| Description | Frontmatter or text-derived description; index stores body text and reading statistics. | Configurable truncation and language-aware statistics; decide source versus transcluded text policy. [Description][s-description], [index][s-index], [Quartz description][q4-description]. |
| Latex | Emitter always runs `remark-math` and KaTeX. The named transformer is empty. | Plugin-owned options, macros, enable/disable, required CSS/fonts/copy behavior; MathJax and Typst are documented alternatives, not absent from parity just because KaTeX exists. [Emitter][s-emit], [stub][s-latex], [Quartz math][q4-latex]. |
| Citations | No matching implementation in core plugin exports. | Bibliography loading, citation styles, bibliography suppression and link options; paths and rebuild dependencies. [Quartz citations][q4-citations]. |
| HardLineBreaks | No matching plugin. | Optional soft-newline-to-break behavior, scoped to parsed prose. [Quartz breaks][q4-breaks]. |
| OxHugoFlavouredMarkdown | No matching plugin. | Hugo references, anchors, shortcodes/figures and Org math compatibility; TOML frontmatter; document interaction with OFM. [Quartz OxHugo][q4-oxhugo]. |
| RoamFlavoredMarkdown | No matching plugin. | Supported Roam shortcodes, tasks, media, quotes, tables and attributes. Match the reference's supported subset rather than promise arbitrary Roam execution. [Quartz Roam][q4-roam]. |
| RemoveDrafts | Generic publication filter exists, but does not inspect `draft`. | Quartz's draft flag works independently of explicit publish permission. Define combination and string-boolean normalization. [Svartz filter][s-filter], [Quartz draft filter][q4-draft]. |
| ExplicitPublish | Explicit mode exists, accepting any truthy configured publication value. | Quartz accepts boolean/string `true`; Svartz also accepts other truthy values. Preserve a deliberate compatibility policy and retain allowed assets. [Svartz filter][s-filter], [Quartz explicit filter][q4-explicit]. |

## All bundled first-party emitters

The reference exports 12 emitters. Svartz can implement these through generators, runtime routes, or build resources.
An HTML recent-notes page is not an RSS feed. Configuring an existing social image is not generating one.
Sources: [Quartz emitter exports][q4-emitters], [Svartz emitter][s-emit], [runtime page][s-page].

| Quartz emitter | Svartz MVP status | Backend and UI boundary |
| --- | --- | --- |
| ContentPage | Compiled Svelte notes and prerender routes exist. | Backend owns rendered content, route metadata and asset URLs; theme owns presentation. [Emitter][s-emit], [runtime][s-page]. |
| FolderPage | Folder counts, routes and theme pages exist. | Verify ancestor folders, authored folder indexes, ordering and collision rules. [Index][s-index], [folder reference][q4-folder]. |
| TagPage | Frontmatter-array tags, routes and theme pages exist. | Nested tag aggregation, normalized tags and authored tag descriptions need parity checks. [Index][s-index], [tag reference][q4-tag]. |
| ContentIndex | Search documents, MiniSearch index, graph/backlinks and XML sitemap exist; `/feed/` is HTML. | RSS XML, limits/full-content mode/feed URLs and autodiscovery; shared publication policy for every generated listing. [Index][s-index], [emitter][s-emit], [sitemap][s-sitemap], [Quartz index][q4-index]. |
| AliasRedirects | Aliases resolve when rewriting links; no redirect artifacts. | Alias/permalink URL generation, relative destinations, duplicate/collision diagnostics. [Links][s-links], [Quartz redirects][q4-aliases]. |
| Assets | Non-Markdown files become binary artifacts. | Publication-safe inclusion, media paths and copying at nested base paths; `.canvas`/`.base` currently remain assets. [Emitter][s-emit], [Quartz assets][q4-assets]. |
| Static | SvelteKit supplies app static assets. | Specify user/theme/plugin static resource ownership and collision rules in an installed project. [CLI][s-cli], [Quartz static][q4-static]. |
| Favicon | App imports a fixed SVG favicon. | Configurable/generative favicon support and theme override. [App layout][s-layout], [Quartz favicon][q4-favicon]. |
| ComponentResources | Vite bundles imports; no declared per-plugin CSS/JS resource contract. | Page-scoped/global resources, deduplication, navigation lifecycle and cleanup. This controls Mermaid, math, tasks, callouts and previews. [Plugin contract][s-contract], [Quartz resources][q4-resources]. |
| NotFoundPage | Theme not-found slot and static adapter `404.html` fallback exist. | Verify real unknown-URL behavior on supported static hosts; UI styles the fallback. [App config][s-app-config], [runtime][s-page], [Quartz 404][q4-404]. |
| CNAME | No core generator found. | Optional custom-domain artifact when the selected hosting target needs it. [Core exports][s-plugins], [Quartz CNAME][q4-cname]. |
| CustomOgImages | Page emits configured OG/Twitter metadata; no image generator. | Per-page images, template/theme inputs, fonts and asset output; design remains a theme task. [Runtime][s-page], [Quartz OG images][q4-og]. |

## Authoring and publishing faults worth settling first

These are source-derived findings, not reproduced failures. They identify focused acceptance fixtures.

1. **Publication and assets.** Explicit publication filters every file, including assets without frontmatter. Those assets disappear. Raw source bodies remain cached before filtering, but embed resolution uses the filtered note set. Do not claim a demonstrated private-note leak from that cache alone. Verify rendered pages, search, graph, feeds, generated images, copied assets and later encryption together. [Filter][s-filter], [embeds][s-embeds].
2. **Transclusion ordering.** Embeds prefer original `sourceBodies` after links/OFM/TOC stages ran. Embedded highlights, links and callouts therefore bypass those earlier rewrites. Cycles have a link fallback; missing sections fall back to the whole note. Block references have no implementation. Specify origin-relative links, stable fragment IDs, cycle behavior and missing-target diagnostics. [Pipeline][s-contract], [embeds][s-embeds].
3. **Parser correctness.** Raw-link regexes scan code/comments too, and replacement uses global string substitution. Image Markdown is excluded from normal link extraction. Heading extraction recognizes ATX headings and backtick fences only. Use fixtures covering code, HTML, escaped tables, duplicate headings, Setext headings, Unicode and nested embeds. [Parser][s-parse], [links][s-links].
4. **Metadata and route consistency.** Tags/aliases require arrays; nested folder ancestors are not explicitly accumulated. Index-link association matches a resolved slug by suffix rather than preserving each resolution result. Routes originate in both theme configuration and helpers. Define one authoritative note identity, URL and reference result. [Index][s-index], [links][s-links].
5. **Rendering resources.** The emitter generates KaTeX markup, but inspected runtime/theme files do not import KaTeX CSS. Callout fold state is data only; no fold handler appeared. Mermaid has no core resource wiring. Backend completion requires resource delivery and lifecycle contracts, not merely correct intermediate markup. [Emitter][s-emit], [OFM][s-ofm], [theme layout][s-theme-layout].

Quartz's OFM also supports image width/height aliases, audio/video/PDF embeds, same-note references, callout aliases, inline tags and block transclusion.
Svartz has image/audio/video/PDF element generation and note/section recursion, but width aliases become image alt text.
Its media type sets overlap on `.webm`, and audio wins. Resolve media policy explicitly.
Source comparison: [Quartz OFM][q4-ofm], [Svartz embeds][s-embeds].

## Quartz 5 expands the baseline

These are separate from the Quartz 4 omissions above. They remain in the parity discussion until Mia sets an explicit version boundary.
The current [plugin catalog][q5-current-catalog] lists 16 transformer entries, two filters, five page types, four emitter entries, OG images, and 17 components.
Some plugins own several roles. Catalog counts are not independent implementation counts.

| Capability | Version evidence | Svartz gap and ownership |
| --- | --- | --- |
| CanvasPage | [Tagged v5 documentation][q5-canvas] | Parse `.canvas`, resolve file nodes/media and emit route/data. UI implements pan/zoom, nodes, groups and edges. Copying JSON as an asset does not satisfy this. |
| BasesPage | [Tagged v5 documentation][q5-bases] | Parse `.base`, evaluate supported filters/formulas/properties/summaries and provide view data. UI renders sortable table/list/cards. Current docs explicitly call map view a placeholder; do not promise full Obsidian Bases parity from that description. |
| EncryptedPages | [Tagged v5 documentation][q5-encryption] | Build-time encryption, redaction from public indexes, page metadata policy and browser decryption. Current development adds encrypted shadow indexes, `unlisted`/`stealth` semantics and post-unlock discovery; those later semantics are [separately documented][q5-current-encryption]. |
| NoteProperties / Frontmatter | [Tagged v5 documentation][q5-properties] | Parsed values and per-note controls need a stable theme contract. Property panel display and collapse controls belong to UI. |
| StackedPages | [Tagged v5 documentation][q5-stacked] | UI navigation mode. Backend must permit reusable note loading with stable URLs, metadata and resource cleanup; no new content pipeline is inherently required. |
| Extended OFM | [Tagged v5 documentation][q5-ofm] | Documented tweet embeds, Obsidian URI annotations and custom task characters extend the bundled v4 comparison. Verify exact external plugin revision before freezing fixtures. |
| External plugin manager | [Tagged authoring instructions][q5-authoring] | Plugin install/configuration/version handling and build integration. Svartz has package-shaped APIs and merge semantics, but no corresponding CLI management or proven outside-repo install. |
| Fonts | [Current development docs][q5-fonts]; file absent in v5.0.0 docs | Per-heading/theme fonts, Google/self-hosted/local delivery. Backend manages font assets; UI picks typography. Do not attribute this standalone plugin to the v5.0.0 tag. |
| UnlistedPages | [Current development docs][q5-unlisted]; file absent in v5.0.0 docs | Separate emitted-but-undiscoverable state across all listings, graph/search and Bases. Distinct from draft exclusion and encryption. |

## Browser behavior, localization and extensibility

| Area | Svartz evidence | Backend handoff required |
| --- | --- | --- |
| Search | MiniSearch documents/index and SearchBox exist. Producer includes aliases in indexed fields; consumer options omit aliases. [Emitter][s-emit], [SearchBox][s-search]. | Shared index format/options; tag-filter semantics, normalized URLs and publication constraints. UI owns dialog, highlighting and keyboard interaction. |
| Graph/backlinks/explorer | Canonical graph and backlink data exist; reusable UI components exist. Minimal theme renders explorer/backlinks but does not mount GraphPanel. [Index][s-index], [UI files][s-ui], [theme layout][s-theme-layout]. | Correct edge targets, metadata and filtering; global/local graph data. UI owns graph controls and layout. |
| Page utilities | Note title/meta/tags, breadcrumbs, recent notes, TOC and Giscus component exist. | Preserve per-note controls, dates, locale and provider configuration. Theme work includes page title/footer/spacer, dark mode, reader mode and remaining component parity. [UI files][s-ui], [theme layout][s-theme-layout], [Quartz components][q4-components]. |
| Popovers and navigation | SvelteKit handles routing; no dedicated content-preview contract found. | Provide safe renderable preview content and stable navigation/resource hooks. UI owns popovers and stacked panes. [Runtime][s-page], [Quartz previews][q5-previews]. |
| Localization | Paraglide middleware exists; app locale configuration currently contains only `en`. | Vault/site locale, note language, text direction, localized generated labels, dates and search behavior. Existing scaffold does not establish Quartz's supported locale coverage. [App locale settings][s-locale], [Quartz i18n][q5-i18n]. |
| Plugins | Factories, validation, version compatibility, lifecycle hooks, deterministic merging and per-stage ordering exist. Hooks are tied to named core stages. | Decide compiler extension access, ordering dependencies, resource/artifact ownership, custom page types and watch invalidation. A redesign may preserve behavior without adding a named hook per new plugin. [Contract][s-contract], [merge][s-merge]. |
| Themes | Versioned manifests, routes, layouts, components, capabilities, plugin presets and custom artifact requirements exist. Runtime rejects lazy component loaders during SSR. | Set the supported eager/lazy contract, custom route enumeration and data APIs before UI implementation. Capability declarations need a defined runtime meaning. [Theme contract][s-theme], [runtime][s-page]. |
| Development/build | CLI handles build/dev/preview, multiple vaults, full content rebuilds and restart-class changes. | Installed-package resolution, clean rebuilds after deletion, resource changes and deterministic output. Incremental performance is a separate decision from content correctness. [CLI][s-cli], [watch contract][s-watch]. |

## Distribution and improvements beyond parity

Mia's requirement is `npx` setup in the invocation directory, with no Svartz clone.
The command must safely initialize an empty directory or an existing vault and produce a usable local project.
The package name and exact command remain decisions; `npx svartz init` is a candidate, not a settled interface.
Svartz's CLI currently offers build/dev/preview, assumes an `apps/web` directory, and ships only its `dist` and README.
There is no initialization command in the inspected CLI. Package publication itself was not checked.
Sources: [CLI commands/workspace lookup][s-cli], [CLI package manifest][s-cli-package].

Quartz 5's tagged [getting-started instructions][q5-start] still clone the repository before invoking its local `npx quartz` command.
Svartz's independent installer is therefore a stated product requirement beyond that onboarding baseline.
Likewise, multi-vault configuration and first-class plugin/theme authoring remain equally central user requirements, regardless of Quartz's architecture.

RSS is established parity. Atom is an optional addition; no Atom emitter appears in the inspected catalogs or bundled ContentIndex.
Other proposals worth separate decisions include actionable broken-link diagnostics, publication previews, reusable validation fixtures, and dependency-aware rebuilds.
These proposals must not displace existing parity requirements such as citations, Roam, OxHugo, math options, Canvas or Bases by assumption.

## Research completion

- Tests: N/A. This branch changes research only; source inspection does not claim runtime validation.
- Capture knowledge: version boundaries and observed implementation constraints are recorded here; no architectural choice was imposed.
- Documentation: all findings point to immutable source snapshots or explicitly live API records.
- Review & Close: audited all bundled transformer/filter/emitter exports and separated v5-tagged behavior from later documented additions.

The next decision is the precise Quartz baseline and behavior contract, especially v5 encryption, Bases, and later development additions.
Then define publication/identity/compiler/resource contracts before splitting implementation or the UI handoff.

[s-plugins]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/index.ts
[s-parse]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/internal/parse.ts
[s-index]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/index-content.ts
[s-emit]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/emit-artifacts.ts
[s-syntax]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-syntax.ts
[s-latex]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-latex.ts
[s-ofm]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-ofm.ts
[s-gfm]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-gfm.ts
[s-toc]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-toc.ts
[s-links]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/resolve-links.ts
[s-description]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-description.ts
[s-filter]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/filter-unpublished.ts
[s-embeds]: https://github.com/mia-cx/svartz/blob/358f6537/packages/plugins/src/transform-embeds.ts
[s-page]: https://github.com/mia-cx/svartz/blob/358f6537/apps/web/src/lib/svartz/SvartzRuntimePage.svelte
[s-sitemap]: https://github.com/mia-cx/svartz/blob/358f6537/apps/web/src/routes/sitemap.xml/%2Bserver.ts
[s-layout]: https://github.com/mia-cx/svartz/blob/358f6537/apps/web/src/routes/%2Blayout.svelte
[s-cli]: https://github.com/mia-cx/svartz/blob/358f6537/packages/cli/src/index.ts
[s-cli-package]: https://github.com/mia-cx/svartz/blob/358f6537/packages/cli/package.json
[s-contract]: https://github.com/mia-cx/svartz/blob/358f6537/packages/core/src/plugin/types.ts
[s-app-config]: https://github.com/mia-cx/svartz/blob/358f6537/apps/web/svelte.config.js
[s-theme-layout]: https://github.com/mia-cx/svartz/blob/358f6537/themes/minimal/src/lib/layouts/SiteLayout.svelte
[s-search]: https://github.com/mia-cx/svartz/blob/358f6537/packages/ui/src/lib/SearchBox.svelte
[s-ui]: https://github.com/mia-cx/svartz/tree/358f6537/packages/ui/src/lib
[s-locale]: https://github.com/mia-cx/svartz/blob/358f6537/apps/web/project.inlang/settings.json
[s-merge]: https://github.com/mia-cx/svartz/blob/358f6537/packages/core/src/plugin/merge.ts
[s-theme]: https://github.com/mia-cx/svartz/blob/358f6537/packages/core/src/theme/types.ts
[s-watch]: https://github.com/mia-cx/svartz/blob/358f6537/.cursor/rules/dev-watch-contract.mdc
[q4-transformers]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/index.ts
[q4-filters]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/filters/index.ts
[q4-emitters]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/index.ts
[q4-frontmatter]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/frontmatter.ts
[q4-dates]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/lastmod.ts
[q4-syntax]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/syntax.ts
[q4-ofm]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/ofm.ts
[q4-gfm]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/gfm.ts
[q4-toc]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/toc.ts
[q4-links]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/links.ts
[q4-description]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/description.ts
[q4-latex]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/latex.ts
[q4-citations]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/citations.ts
[q4-breaks]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/linebreaks.ts
[q4-oxhugo]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/oxhugofm.ts
[q4-roam]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/transformers/roam.ts
[q4-draft]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/filters/draft.ts
[q4-explicit]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/filters/explicit.ts
[q4-folder]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/folderPage.tsx
[q4-tag]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/tagPage.tsx
[q4-index]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/contentIndex.tsx
[q4-aliases]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/aliases.ts
[q4-assets]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/assets.ts
[q4-static]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/static.ts
[q4-favicon]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/favicon.ts
[q4-resources]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/componentResources.ts
[q4-404]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/404.tsx
[q4-cname]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/cname.ts
[q4-og]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/plugins/emitters/ogImage.tsx
[q4-components]: https://github.com/mia-cx/svartz/blob/358f6537/packages/reference/quartz/components/index.ts
[q5-catalog]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/index.md
[q5-authoring]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/advanced/making%20plugins.md
[q5-loader]: https://github.com/jackyzha0/quartz/tree/97a2d05f80c4c50534959b1d0d41cc4b3895625e/quartz/plugins/loader
[q5-current-catalog]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/plugins/index.md
[q5-canvas]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/CanvasPage.md
[q5-bases]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/BasesPage.md
[q5-encryption]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/EncryptedPages.md
[q5-current-encryption]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/plugins/EncryptedPages.md
[q5-properties]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/Frontmatter.md
[q5-stacked]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/StackedPages.md
[q5-ofm]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/plugins/ObsidianFlavoredMarkdown.md
[q5-fonts]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/plugins/Fonts.md
[q5-unlisted]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/plugins/UnlistedPages.md
[q5-previews]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/features/popover%20previews.md
[q5-i18n]: https://github.com/jackyzha0/quartz/blob/97a2d05f80c4c50534959b1d0d41cc4b3895625e/docs/features/i18n.md
[q5-start]: https://github.com/jackyzha0/quartz/blob/ab346fa66a895e12d63a308e70ce330ba795822a/docs/index.md

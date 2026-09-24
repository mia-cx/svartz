# Core plugins

`createCorePlugins()` from `@svartz/plugins` returns the built-in plugins in pipeline order.

| Plugin ID | Hook | Job |
| --- | --- | --- |
| `core:discover-files` | `discoverFiles` | Read vault files and assign slugs |
| `core:parse-frontmatter` | `parseFrontmatter` | Parse metadata and raw links |
| `core:filter-unpublished` | `filterUnpublished` | Keep published notes and their referenced assets |
| `core:resolve-links` | `resolveLinks` | Resolve links among published notes |
| `core:transform-ofm` | `transformOfm` | Convert OFM comments, highlights, and callouts |
| `core:transform-gfm` | `transformGfm` | Register remark-gfm |
| `core:transform-toc` | `transformToc` | Extract headings |
| `core:transform-description` | `transformDescription` | Extract summaries |
| `core:transform-syntax` | `transformSyntax` | Register code highlighting when used |
| `core:transform-latex` | `transformLatex` | Render math and declare KaTeX CSS when used |
| `core:transform-embeds` | `transformEmbeds` | Expand published embeds |
| `core:index` | `indexContent` | Build search, graph, and route index |
| `core:emit-artifacts` | `emitArtifacts` | Compile pages and emit runtime artifacts |

The build also has `buildStart`, `configResolved`, `buildEnd`, and development `handleChange` hooks. The six required stages are discovery, frontmatter parsing, publication filtering, link resolution, indexing, and emission. The transforms are optional. Stages run in the listed order, with `pre`, default, and `post` order within each stage. Content transforms run serially.

Plugins from the theme, config defaults, and vault config can replace a built-in by ID. Disable an optional built-in with `{ id: "core:transform-gfm", disabled: true }`. See [[contracts/plugin-contract]] and [[guides/create-plugin]].

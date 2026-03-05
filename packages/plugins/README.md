# @svartz/plugins

Core pipeline plugins for the Svartz build system. These plugins handle the canonical build stages from vault discovery through artifact emission.

## Core Plugin IDs and Hook Map

| Plugin ID                    | Hook Key               | Enforce | Description                                        |
| ---------------------------- | ---------------------- | ------- | -------------------------------------------------- |
| `core:discover-files`        | `discoverFiles`        | default | Traverse vault, read files, assign canonical slugs |
| `core:parse-frontmatter`     | `parseFrontmatter`     | default | Extract YAML frontmatter and raw links             |
| `core:filter-unpublished`    | `filterUnpublished`    | default | Remove unpublished files from pipeline             |
| `core:resolve-links`         | `resolveLinks`         | default | Resolve wikilinks/md links to canonical slugs      |
| `core:transform-ofm`         | `transformOfm`         | default | Obsidian Flavored Markdown transforms              |
| `core:transform-gfm`         | `transformGfm`         | default | GitHub Flavored Markdown transforms                |
| `core:transform-toc`         | `transformToc`         | default | Table of Contents extraction                       |
| `core:transform-description` | `transformDescription` | default | Auto-generate descriptions                         |
| `core:transform-syntax`      | `transformSyntax`      | default | Syntax highlighting                                |
| `core:transform-latex`       | `transformLatex`       | default | LaTeX/math processing                              |
| `core:index`                 | `indexContent`         | default | Build canonical index (search + graph + backlinks) |
| `core:emit-artifacts`        | `emitArtifacts`        | default | Write index.json to disk                           |

All core hooks set `fatal: true`. `core:emit-artifacts` sets `parallel: true`.

## Ordering Contract

Execution order is deterministic:

1. Fixed hook order in runner
2. `enforce` tier: `pre` -> `default` -> `post`
3. Stable config array order within each tier

### Stage Dependency Chain

1. **discoverFiles** — postcondition: every file has `slug: string`
2. **parseFrontmatter** — requires files with slugs
3. **filterUnpublished** — requires frontmatter parsed (runs `post`)
4. **resolveLinks** — requires stable slugs for all files
5. **transforms** — require parsed frontmatter and resolved links
6. **indexContent** — requires all transforms complete
7. **emitArtifacts** — requires index built

## Published Semantics

| Frontmatter value              | Result          |
| ------------------------------ | --------------- |
| missing / `null` / `undefined` | published       |
| `true`                         | published       |
| `"2025-01-01"` (datetime)      | published       |
| `false`                        | **unpublished** |
| `""` (empty string)            | **unpublished** |

## Determinism Guarantees

- Canonical slug = full vault-relative path, extensionless, lowercased, special chars normalized
- Two files at different paths never produce the same canonical slug
- Alias collisions are excluded from alias-based resolution
- Link strategy (`closest`/`shallowest`/`absolute`) has deterministic tie-breaks
- Index entries sorted by slug; graph/backlinks keys sorted lexicographically
- Emitted artifacts are stable across runs for identical input

## Usage

```ts
import { createCorePlugins, CORE_PLUGIN_IDS } from "@svartz/plugins";

const plugins = createCorePlugins();
```

Individual plugin factories are also exported for selective use:

```ts
import { discoverFiles, parseFrontmatter } from "@svartz/plugins";
```

## Deferred: @svartz/plugin-mdsvex

mdsvex is a rendering/adapter concern, not a core pipeline plugin. It will be implemented as an optional `@svartz/plugin-mdsvex` package that:

- Integrates at the renderer/emit boundary
- Does not own canonical parse/transform/index semantics
- Is not included in the default core plugin set

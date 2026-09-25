# `@svartz/plugins`

`createCorePlugins()` returns the v1 default pipeline. The factories are also exported individually. Configure a plugin with the same ID to replace it, or disable it through the plugin merge contract in `@svartz/core`.

| Stage | Default work |
| --- | --- |
| Discovery and publication | Discover all note and asset candidates; parse frontmatter; apply inclusion/exclusion, `draft`, `published_at`, `private`, password groups, and referenced-asset reachability. |
| Routes and links | Allocate collision-free canonical URLs and aliases; resolve links only against published notes. |
| Transforms | OFM, GFM, TOC, descriptions, Shiki syntax, KaTeX, and recursive embeds. Each major transform has its own plugin hook. |
| Index and output | Build published search, graph, backlinks, tags, folders, and route data; emit Svelte note artifacts, feeds, sitemaps, social images, favicons, and browser resources. |

The canonical order is in [`createCorePlugins()`](src/index.ts). Hooks run in the order in `@svartz/core`'s `STAGE_NAMES`; `enforce: 'pre' | 'post'` changes order within one hook. Mutating transforms run serially. The emitter compiles `.svx` as authored Svelte. `.md` and `.mdx` remain inert Markdown.

Publication defaults to exclusion mode, so every note is public except configured `exclude[]` patterns. Inclusion mode publishes only `include[]` matches. A true `draft` hides a note, `published_at` publishes it immediately, and a true `private` always hides it. A configured publication field applies when `published_at` is blank. Unpublished note content cannot enter public embeds, search, graph, or generated listings. Only attachments referenced by visible content or the effective frontmatter image enter output; comment-only attachments stay private. Inline and reference-style Markdown assets resolve from the note, and URL queries and fragments survive rewriting. Protected SVX is separately encrypted; its public shell contains no note body.

Optional factories are disabled until configured: `hardLineBreaks`, `roamFlavoredMarkdown`, `oxHugoFlavoredMarkdown`, and `citations`. The citation plugin reads bibliography files relative to the vault. These are authoring-format choices, not implicit defaults.

```ts
import { createCorePlugins, hardLineBreaks } from '@svartz/plugins';

const defaults = createCorePlugins();
const optional = hardLineBreaks();
```

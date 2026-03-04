# Vite plugin: Quartz-inspired features to support

## Overview

Analyzing Quartz v4, here are the main categories of work the Vite plugin orchestrates. Our plugin will follow a similar architecture: **transformers** (markdown processing), **filters** (content exclusion), and **emitters** (output generation).

---

## 1. Transformers (markdown processing)

Transform individual notes during the pipeline. These modify AST and extract metadata.

### Core transformers to support

| Feature | Purpose | Example |
|---------|---------|---------|
| **Frontmatter** | Extract YAML metadata (title, date, tags, etc.) | `{ title: "...", tags: [...], date: "..." }` |
| **Wikilinks** | Parse and resolve `[[Page]]` syntax | `[[My Page\|Label]]` → link to resolved slug |
| **Obsidian Flavor Markdown** | Handle Obsidian-specific syntax: `![[embed]]`, `> [!callout]`, `^^highlight^^` | Embed files, callouts, highlights |
| **GitHub Flavor Markdown** | Handle GFM: tables, strikethrough, task lists | Standard markdown extensions |
| **Syntax Highlighting** | Highlight code blocks | Use Shiki or similar |
| **LaTeX / Math** | Render math expressions | `$x^2 + y^2 = z^2$` via KaTeX |
| **Table of Contents** | Generate TOC from headings | `## Headings` → `{ headings: [...] }` |
| **Descriptions** | Extract first N sentences for meta tags | Auto-generate `og:description` |
| **Line Breaks** | Convert soft breaks to `<br>` | Markdown formatting |
| **Citations** | Handle bibliography syntax | BibTeX / pandoc-cite |

### Transformer output

Each transformer adds to or modifies `file.data`:

```ts
// After all transformers run:
{
  slug: "note-one",
  title: "Note One",
  description: "First few sentences...",
  tags: ["tag1", "tag2"],
  date: new Date("2024-01-01"),
  links: ["note-two", "note-three"],  // resolved wikilinks
  headings: [{ level: 1, text: "Heading 1", slug: "heading-1" }],
  html: "<h1>...</h1>",  // rendered HTML
  // ... any custom metadata
}
```

---

## 2. Filters (content exclusion)

Decide which notes to publish. Run after transformation, before emission.

### Core filters to support

| Filter | Purpose | Example |
|--------|---------|---------|
| **Remove Drafts** | Exclude notes with `draft: true` in frontmatter | Skip unpublished notes |
| **Explicit Publish** | Require `publish: true` to include | Opt-in model |
| **Access Control** | Check for tags or roles | Only render public notes |
| **Custom Filter** | User-defined logic | Skip by filename pattern, date, etc. |

---

## 3. Emitters (output generation)

Generate static files or data structures. Run after filtering on the full collection.

### Core emitters to support

| Emitter | Purpose | Output |
|---------|---------|--------|
| **Content Pages** | Render each note as a static page | `.html` files for each slug |
| **Folder Pages** | Generate index pages for directories | `index.html` per folder |
| **Tag Pages** | Generate page listing notes by tag | `/tags/tag-name/index.html` |
| **Content Index** | Build searchable index for client-side search | `search.json` or similar |
| **Sitemap** | Generate `sitemap.xml` for SEO | Search engine discovery |
| **RSS Feed** | Generate RSS feed of recent notes | `feed.xml` |
| **Aliases / Redirects** | Create redirect pages for alternate slugs | `old-slug.html` → redirect to `new-slug` |
| **Assets** | Copy static files (images, CSS, JS) | Copy from vault + theme |
| **Component Resources** | Extract and emit CSS/JS for components | Optimization + HMR |
| **Custom Emitters** | User-defined output (e.g., JSON dump) | Plugin-specific files |

---

## 4. Parallel execution

The plugin orchestrates transformers → filters → emitters, but can parallelize:

```ts
// Sequential:
// 1. Traverse vault → files
// 2. Build manifest
// 3. Apply transformers to each file
// 4. Apply filters (exclude files)
// 5. Run emitters (generate pages)

// Parallelizable:
// - Step 3: Apply transformers to all files in parallel
// - Step 5: Run emitters in parallel (if they don't depend on each other)
```

---

## 5. Incremental / watch mode

In dev mode, the plugin watches vault changes and re-runs affected steps:

### Change detection

| Change Type | Action |
|-------------|--------|
| **File added** | Run transformers + emitters for that file |
| **File modified** | Re-transform + re-emit |
| **File deleted** | Remove output, clean redirects |
| **Config changed** | Re-run full pipeline |

### HMR signal

Send HMR signal to SvelteKit to reload affected routes:

```ts
server.ws.send({ 
  type: 'full', 
  event: 'special', 
  event_name: 'svartz:vault-updated'
});
```

---

## 6. Plugin architecture pattern (like Quartz)

Define a plugin interface that users can extend:

```ts
export type SvartzTransformer<Options = undefined> = (
  opts?: Options
) => SvartzTransformerInstance;

export type SvartzTransformerInstance = {
  name: string;
  // Modify markdown AST before rendering
  markdownPlugins?: (ctx: BuildCtx) => PluggableList;
  // Modify HTML AST after rendering
  htmlPlugins?: (ctx: BuildCtx) => PluggableList;
  // Extract external resources (CSS, JS)
  externalResources?: (ctx: BuildCtx) => StaticResources;
};

export type SvartzFilter<Options = undefined> = (
  opts?: Options
) => SvartzFilterInstance;

export type SvartzFilterInstance = {
  name: string;
  // Return true to keep note, false to exclude
  shouldPublish: (ctx: BuildCtx, content: ProcessedContent) => boolean;
};

export type SvartzEmitter<Options = undefined> = (
  opts?: Options
) => SvartzEmitterInstance;

export type SvartzEmitterInstance = {
  name: string;
  // Generate output files
  emit: (ctx: BuildCtx, content: ProcessedContent[]) => Promise<FilePath[]>;
  // Incremental emit for watch mode
  partialEmit?: (
    ctx: BuildCtx,
    content: ProcessedContent[],
    changeEvents: ChangeEvent[]
  ) => Promise<FilePath[]>;
};
```

Users can extend with custom transformers, filters, emitters:

```ts
// svartz.config.ts
import { defineConfig } from '@svartz/vite-plugin';
import { FrontMatter, Wikilinks, ObsidianFlavor } from '@svartz/transformers';
import { RemoveDrafts } from '@svartz/filters';
import { ContentPages, Sitemap, RSS } from '@svartz/emitters';

export default defineConfig({
  vaults: [...],
  plugins: {
    transformers: [
      FrontMatter(),
      Wikilinks(),
      ObsidianFlavor({ enableCallouts: true }),
      // custom:
      MyCustomTransformer({ option: value }),
    ],
    filters: [
      RemoveDrafts(),
      // custom:
      MyAccessControl({ roles: ['public', 'subscriber'] }),
    ],
    emitters: [
      ContentPages(),
      Sitemap({ enableSiteMap: true }),
      RSS({ enableRSS: true, limit: 20 }),
      // custom:
      MyJSONExporter(),
    ],
  },
});
```

---

## 7. Context and metadata flow

Each stage passes context:

```ts
type BuildCtx = {
  buildId: string;  // Unique build ID for cache-busting
  config: SvartzConfig;
  allSlugs: string[];  // All slugs in vault
  allFiles: string[];  // All files in vault (including assets)
  vaultDir: string;
  targetType: 'worker' | 'pages' | 'static';  // Build target
  incremental: boolean;  // Is this a watch rebuild?
};

type ProcessedContent = [tree: HTMLTree, file: VFile];

type VFile = {
  path: string;
  data: {
    slug: string;
    title: string;
    description?: string;
    tags: string[];
    date?: Date;
    links: string[];  // resolved wikilinks
    headings: Heading[];
    html: string;  // rendered HTML
    // ... plugin-specific data
  };
};
```

---

## 8. What the Vite plugin MVP should include

**Phase 1 (MVP):**
- ✅ Traverse vault, build manifest
- ✅ Resolve wikilinks, build graph + backlinks
- ✅ Transform markdown via mdsvex → `.svelte` files
- ✅ Generate manifest, graph, backlinks as artifacts
- ✅ Watch vault, re-run on changes, HMR signal
- ⏳ Remove drafts (filter)
- ⏳ Generate sitemap (emitter)
- ⏳ Generate search index (emitter)

**Phase 2 (extended):**
- Syntax highlighting (transformer)
- LaTeX / math (transformer)
- Obsidian callouts, embeds (transformer)
- GitHub flavor markdown (transformer)
- Tag pages (emitter)
- RSS feed (emitter)
- Aliases / redirects (emitter)

**Phase 3+ (user extensibility):**
- Plugin system (custom transformers, filters, emitters)
- Component resource extraction
- Custom metadata and processors

---

## Summary

| Layer | Scope |
|-------|-------|
| **@svartz/vault** | Traversal, manifest, graph, backlinks, wikilink resolution (testable, reusable) |
| **@svartz/vite-plugin** | Orchestrate vault functions, apply transformers/filters/emitters, mdsvex compilation, watch/HMR |
| **Route** | Read artifacts, prerender pages |
| **Theme** | Layouts, components, styling |

The plugin is the **processing orchestrator**, not a monolithic build system. Transformers/filters/emitters are pluggable; the vault logic is separate and reusable.

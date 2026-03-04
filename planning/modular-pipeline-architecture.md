# Modular pipeline architecture: atomic packages

## Overview

Rather than one "content-pipeline" package, use multiple atomic packages, each responsible for one step. The **Vite plugin orchestrates** them in sequence (and parallel where possible).

```
@svartz/vault-traverser
        ↓ (vault → files list)
@svartz/manifest-builder
        ↓ (files → manifest.ts)
    ┌───┴───┬─────────┬──────────┐
    ↓       ↓         ↓          ↓
graph-    backlinks- wikilink-  
builder   builder    resolver
    └───┬───┴─────────┘
        ↓
    Vite plugin calls mdsvex.compile() directly
        ↓
    Write .svelte files to src/lib/generated/notes/
```

---

## The packages

### 1. `@svartz/vault-traverser`

Walks the vault, discovers `.md` files, respects `.obsidian` ignore patterns, returns a list.

```ts
export async function traverseVault(vaultPath: string): Promise<VaultFile[]> {
  // Walk filesystem, return [{ path, name, ext, content }, ...]
}
```

### 2. `@svartz/manifest-builder`

Takes vault files, extracts frontmatter, generates slugs, creates the manifest.

```ts
import { traverseVault } from "@svartz/vault-traverser";

export async function buildManifest(vaultPath: string): Promise<Manifest> {
  const files = await traverseVault(vaultPath);
  return {
    notes: files.map((file) => ({
      slug: fileToSlug(file),
      title: extractTitle(file),
      path: file.path,
      // raw markdown, not processed yet
      markdown: file.content,
      frontmatter: extractFrontmatter(file),
    })),
  };
}

export interface Manifest {
  notes: ManifestEntry[];
}

export interface ManifestEntry {
  slug: string;
  title: string;
  path: string;
  markdown: string;
  frontmatter: Record<string, any>;
}
```

**Output:** TypeScript file (not JSON), so it can be imported directly:

```ts
// src/lib/generated/manifest.ts (written by plugin)
export const manifest: Manifest = {
  notes: [
    { slug: 'note-one', title: 'Note One', markdown: '# Note One\n...', ... },
    { slug: 'nested/note-two', title: 'Note Two', markdown: '# Note Two\n...', ... },
  ]
};
```

### 3. `@svartz/graph-builder`

Takes manifest, builds link graph (which notes link to which).

```ts
import type { Manifest } from "@svartz/manifest-builder";

export interface LinkGraph {
  [slug: string]: string[]; // slug → list of slugs it links to
}

export async function buildGraph(manifest: Manifest): Promise<LinkGraph> {
  // For each note, find wikilinks [[...]]
  // Return map of slug → target slugs
}
```

### 4. `@svartz/backlinks-builder`

Takes manifest + graph, calculates reverse links (which notes link TO this note).

```ts
import type { Manifest, LinkGraph } from "@svartz/manifest-builder";

export interface Backlinks {
  [slug: string]: string[]; // slug → list of slugs that link to it
}

export function buildBacklinks(graph: LinkGraph): Backlinks {
  // Invert the graph
}
```

### 5. `@svartz/wikilink-resolver`

Takes manifest + graph, resolves wikilinks in markdown to actual slugs (handles ambiguous links, aliases, etc.).

```ts
export interface ResolvedMarkdown {
  [slug: string]: string; // slug → markdown with wikilinks resolved/annotated
}

export function resolveWikilinks(
  manifest: Manifest,
  graph: LinkGraph,
): ResolvedMarkdown {
  // For each note, replace [[Page]] with resolved target
  // Return slug → processed markdown
}
```

### 6. Vite plugin calls mdsvex directly

After resolving wikilinks, the **plugin** (not a separate package) calls mdsvex's `compile` function to turn resolved markdown into Svelte component source:

```ts
import { compile } from 'mdsvex';

for (const [slug, markdownWithComponents] of Object.entries(resolved)) {
  const { code } = await compile(markdownWithComponents);
  fs.writeFileSync(`src/lib/generated/notes/${slug}.svelte`, code);
}
```

No separate `@svartz/markdown-processor` package needed. The plugin orchestrates everything.

---

## Vite plugin orchestration

The plugin calls these in sequence:

```ts
// packages/vite-plugin/src/vault-resolver.ts

import { buildManifest } from "@svartz/manifest-builder";
import { buildGraph } from "@svartz/graph-builder";
import { buildBacklinks } from "@svartz/backlinks-builder";
import { resolveWikilinks } from "@svartz/wikilink-resolver";
import { processMarkdown } from "@svartz/markdown-processor";
import { writeGeneratedFiles } from "./write-generated";

async function runPipeline(vaultDir: string, projectRoot: string) {
  // 1. Build manifest (required; blocks next steps)
  const manifest = await buildManifest(vaultDir);

  // 2. Build graph (can run in parallel after manifest)
  const graph = await buildGraph(manifest);

  // 3. Build backlinks (requires graph)
  const backlinks = buildBacklinks(graph);

  // 4. Resolve wikilinks (requires manifest + graph)
  const resolved = resolveWikilinks(manifest, graph);

  // 5. Directly use mdsvex to compile resolved markdown into .svelte files
  import { compile } from 'mdsvex';
  for (const [slug, markdownWithComponents] of Object.entries(resolved)) {
    const { code } = await compile(markdownWithComponents);
    const outputPath = path.join(projectRoot, 'src/lib/generated/notes', `${slug}.svelte`);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, code);
  }

  // 6. Write metadata artifacts
  const artifacts = {
    manifest,
    graph,
    backlinks,
  };

  await writeGeneratedFiles(projectRoot, artifacts);
}
```

---

## Generated artifacts

After the pipeline, `src/lib/generated/` contains:

```ts
// src/lib/generated/manifest.ts
export const manifest = { notes: [...] };

// src/lib/generated/graph.ts
export const graph = { 'note-one': ['note-two'], ... };

// src/lib/generated/backlinks.ts
export const backlinks = { 'note-one': ['note-two'], ... };

// src/lib/generated/notes/*.svelte (individual note components)
// e.g., src/lib/generated/notes/note-one.svelte (mdsvex-compiled Svelte component)
// e.g., src/lib/generated/notes/nested/note-two.svelte
```

---

## Route setup: `entries()` and `+page.svelte`

You **still need** `src/routes/[...slug]/+page.svelte` and `+page.server.ts`:

```ts
// src/routes/[...slug]/+page.server.ts
import { error } from "@sveltejs/kit";
import { manifest } from "$lib/generated/manifest";
import { backlinks } from "$lib/generated/backlinks";

export const prerender = true;

export const entries = async () => {
  return manifest.notes.map((note) => ({ slug: note.slug }));
};

export const load = async ({ params }) => {
  const slug = params.slug;
  const note = manifest.notes.find((n) => n.slug === slug);

  if (!note) {
    throw error(404, "Note not found");
  }

  // Dynamically import the mdsvex-processed component for this note
  // Plugin writes each note as a .svelte file to src/lib/generated/notes/
  const noteComponent = (await import(`$lib/generated/notes/${slug}.svelte`)).default;

  return {
    note,
    noteComponent,
    backlinks: backlinks[slug] || [],
  };
};
```

```svelte
<!-- src/routes/[...slug]/+page.svelte -->
<script>
  export let data;
</script>

<article>
  <h1>{data.note.title}</h1>
  
  <!-- Render the mdsvex-processed Svelte component -->
  <svelte:component this={data.noteComponent} />
  
  {#if data.backlinks.length > 0}
    <aside>
      <h2>Backlinks</h2>
      <ul>
        {#each data.backlinks as backlink}
          <li><a href="/{backlink}">{backlink}</a></li>
        {/each}
      </ul>
    </aside>
  {/if}
</article>
```

**Note:** The `data.noteComponent` is a **dynamically imported Svelte component** created at build time from the mdsvex-processed markdown. See below.

---

## About mdsvex

**mdsvex IS used in the pipeline**, not as a Svelte preprocessor for routes, but as a **markdown → Svelte converter** inside the markdown-processor package.

The flow:
1. User writes vault note with Svelte components: `# My Note\n\nSome text\n\n<MyComponent />`
2. Pipeline runs mdsvex preprocessor on that content
3. mdsvex converts markdown + Svelte syntax → valid Svelte component source
4. Plugin writes the result to `src/lib/generated/notes/slug.svelte`
5. Route imports that `.svelte` file and renders it

So mdsvex is a **build-time tool** for processing vault content, not a route-level preprocessor. Users don't author `.svx` files; they author `.md` files with Svelte components in them.

---

## Summary

| Step | Package            | Input → Output                                           |
| ---- | ------------------ | -------------------------------------------------------- |
| 1    | vault-traverser    | vault path → file list                                                         |
| 2    | manifest-builder   | files → manifest (slugs, titles, raw markdown)                                 |
| 3    | graph-builder      | manifest → link graph                                                          |
| 4    | backlinks-builder  | graph → reverse links                                                          |
| 5    | wikilink-resolver  | manifest + graph → resolved markdown                                           |
| 6    | **vite-plugin** (mdsvex) | resolved markdown → .svelte files in src/lib/generated/notes/ (mdsvex-compiled) |
| —    | route's entries()  | reads manifest, tells SvelteKit which slugs to prerender                       |
| —    | route's load()     | dynamically imports .svelte component from src/lib/generated/notes/            |
| —    | +page.svelte       | renders component + backlinks                                                 |

Each package is small, testable, and can run in parallel (where dependencies allow). The plugin orchestrates all steps and directly calls mdsvex (no separate processor package).

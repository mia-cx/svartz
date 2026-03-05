# Modular pipeline architecture: @svartz/vault package

## Overview

Rather than multiple small packages, use **one `@svartz/vault` package** that exports different functions for different purposes. The **Vite plugin orchestrates** them in parallel where possible.

```
@svartz/vault
  ├── traverseVault() → files list
  ├── buildManifest() → manifest
  ├── buildGraph() → link graph
  ├── buildBacklinks() → reverse links
  └── resolveWikilinks() → resolved markdown

Vite plugin:
  1. traverseVault(vaultDir) → files
  2. buildManifest(files) → manifest
  3. buildGraph(manifest) + buildBacklinks(graph) [parallel]
  4. resolveWikilinks(manifest, graph) [depends on graph]
  5. mdsvex.compile() on resolved markdown → .svelte files
  6. Write artifacts (manifest, graph, backlinks)
```

---

## The @svartz/vault package

One package with clear, focused exports:

```ts
// packages/vault/src/index.ts

export async function traverseVault(vaultPath: string): Promise<VaultFile[]> {
  // Walk filesystem, discover .md files, respect .obsidian ignores
}

export async function buildManifest(files: VaultFile[]): Promise<Manifest> {
  // Extract frontmatter, generate slugs, create manifest
}

export async function buildGraph(manifest: Manifest): Promise<LinkGraph> {
  // Parse wikilinks, build link graph
}

export function buildBacklinks(graph: LinkGraph): Backlinks {
  // Invert graph to get backlinks
}

export function resolveWikilinks(
  manifest: Manifest,
  graph: LinkGraph
): ResolvedMarkdown {
  // Resolve wikilinks in markdown to actual slugs
}

// Types
export interface Manifest { notes: ManifestEntry[] }
export interface ManifestEntry {
  slug: string;
  title: string;
  path: string;
  markdown: string;
  frontmatter: Record<string, any>;
}
export interface LinkGraph { [slug: string]: string[] }
export interface Backlinks { [slug: string]: string[] }
export type ResolvedMarkdown = { [slug: string]: string }
```

All vault/Obsidian logic in one place, clean exports.

---

## Vite plugin orchestration

The plugin calls these functions and handles mdsvex:

```ts
// packages/vite-plugin/src/vault-resolver.ts

import {
  traverseVault,
  buildManifest,
  buildGraph,
  buildBacklinks,
  resolveWikilinks,
} from '@svartz/vault';
import { compile } from 'mdsvex';
import path from 'path';
import fs from 'fs/promises';

async function runPipeline(projectRoot: string, vaultDir: string) {
  const fullVaultPath = path.resolve(projectRoot, vaultDir);

  // 1. Traverse vault
  const files = await traverseVault(fullVaultPath);

  // 2. Build manifest
  const manifest = await buildManifest(files);

  // 3-4. Build graph + backlinks in parallel; resolve wikilinks (depends on graph)
  const graph = await buildGraph(manifest);
  const backlinks = buildBacklinks(graph);
  const resolved = resolveWikilinks(manifest, graph);

  // 5. Compile markdown to .svelte files using mdsvex
  for (const [slug, markdownWithComponents] of Object.entries(resolved)) {
    const { code } = await compile(markdownWithComponents);
    const outputPath = path.join(projectRoot, 'src/lib/generated/notes', `${slug}.svelte`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, code);
  }

  // 6. Write metadata artifacts (manifest, graph, backlinks as .ts files)
  const artifacts = {
    manifest: `export const manifest = ${JSON.stringify(manifest, null, 2)};`,
    graph: `export const graph = ${JSON.stringify(graph, null, 2)};`,
    backlinks: `export const backlinks = ${JSON.stringify(backlinks, null, 2)};`,
  };

  for (const [name, content] of Object.entries(artifacts)) {
    const outputPath = path.join(projectRoot, `src/lib/generated/${name}.ts`);
    await fs.writeFile(outputPath, content);
  }
}

export function vaultResolverPlugin() {
  let config: any;
  let watcher: any;

  return {
    name: 'vault-resolver',

    configResolved(resolvedConfig: any) {
      config = resolvedConfig;
    },

    async buildStart() {
      const vaultDir = process.env.VAULT_DIR;
      if (!vaultDir) return;
      await runPipeline(process.cwd(), vaultDir);
    },

    async configureServer(server: any) {
      if (config.command !== 'serve') return;

      const vaultDir = process.env.VAULT_DIR;
      if (!vaultDir) {
        console.warn('⚠️  VAULT_DIR not set; vault resolution disabled');
        return;
      }

      const fullVaultPath = path.resolve(process.cwd(), vaultDir);
      console.log(`👀 Watching vault: ${fullVaultPath}`);

      await runPipeline(process.cwd(), vaultDir);

      const chokidar = await import('chokidar');
      watcher = chokidar.watch(fullVaultPath, {
        ignored: /(^|[\/\\])\.|node_modules/,
        awaitWriteFinish: { stabilityThreshold: 500 },
      });

      watcher.on('change', async (filePath: string) => {
        console.log(`🔄 Vault changed: ${filePath}`);
        try {
          await runPipeline(process.cwd(), vaultDir);
          server.ws.send({ 
            type: 'full', 
            event: 'special', 
            event_name: 'svartz:vault-updated' 
          });
          console.log(`✅ Artifacts regenerated`);
        } catch (err) {
          console.error(`❌ Pipeline error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      return () => { if (watcher) watcher.close(); };
    },
  };
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
// e.g., src/lib/generated/notes/note-one.svelte (mdsvex-compiled)
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

---

## About mdsvex

**mdsvex IS used in the pipeline**, but as a **markdown → Svelte converter** inside the plugin (via the `compile` function).

The flow:
1. User writes vault note with Svelte components: `# My Note\n\nSome text\n\n<MyComponent />`
2. Plugin calls `resolveWikilinks()` from `@svartz/vault` on the markdown
3. Plugin calls `mdsvex.compile()` on the resolved markdown
4. mdsvex converts markdown + Svelte syntax → valid Svelte component source
5. Plugin writes the result to `src/lib/generated/notes/slug.svelte`
6. Route dynamically imports and renders that component

So mdsvex is a **build-time tool** for processing vault content, not a route-level preprocessor. Users author `.md` files with Svelte components in them, and the plugin handles the rest.

---

## Summary

| Layer | Responsibility |
|-------|-----------------|
| **@svartz/vault** | Vault traversal, manifest building, graph/backlinks, wikilink resolution. Pure functions, testable. |
| **@svartz/vite-plugin** | Orchestrates vault package functions in parallel, calls mdsvex.compile(), writes .svelte files and artifacts. |
| **Route (entries())** | Reads manifest, tells SvelteKit which slugs to prerender. |
| **Route (load())** | Dynamically imports .svelte component, fetches backlinks. |
| **+page.svelte** | Renders component + backlinks. |

The `@svartz/vault` package is reusable—the CLI or other tools could import and use it too.

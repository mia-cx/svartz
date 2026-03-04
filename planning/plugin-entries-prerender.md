# Vite plugin: handling `entries()` and prerendering dynamic routes

## The setup

For a dynamic note route like `src/routes/[...slug]/+page.svx`, SvelteKit needs to know which slugs to prerender. You can't hardcode them; they come from your vault.

The flow:

1. **Content pipeline** (vault package) traverses vault, builds manifest of notes with their slugs.
2. **Plugin writes manifest** to `src/lib/generated/manifest.json` (or in-memory structure).
3. **Route's `+page.server.ts`** exports an **`entries()`** function that reads the manifest and tells SvelteKit "prerender these slugs."
4. **SvelteKit prerenderer** calls `entries()`, gets the list, and generates one static page per slug.

---

## In your plugin

### 1. Pipeline outputs manifest

After the content pipeline runs (in both `buildStart` and dev mode on change), write:

```ts
// File: src/lib/generated/manifest.json
{
  "notes": [
    { "slug": "note-one", "title": "Note One", "path": "folder/note-one.md" },
    { "slug": "nested/note-two", "title": "Note Two", "path": "folder/nested/note-two.md" },
    // ...
  ]
}
```

This is the **contract** between the plugin and the route.

### 2. Route exports `entries()`

```ts
// File: src/routes/[...slug]/+page.server.ts
import type { EntryGenerator } from "./$types";

export const entries: EntryGenerator = async () => {
  const manifest = await import("$lib/generated/manifest.json");
  return manifest.notes.map((note) => ({ slug: note.slug }));
};

export const prerender = true;
```

SvelteKit calls this at build start. For each entry, it generates one prerendered page.

### 3. Page component uses the manifest

```svx
<!-- File: src/routes/[...slug]/+page.svx -->
<script>
  import { page } from '$app/stores';
  import { findNoteBySlug } from '$lib/generated/manifest.json'; // or read it in load

  const slug = $page.params.slug;
  const note = findNoteBySlug(slug);
</script>

<h1>{note.title}</h1>
{@html note.htmlContent}
```

Or in a `+page.server.ts` `load` function:

```ts
export const load = async ({ params }) => {
  const manifest = await import("$lib/generated/manifest.json");
  const note = manifest.notes.find((n) => n.slug === params.slug);
  if (!note) throw error(404);
  return { note };
};
```

---

## Plugin responsibilities

### On first run (`buildStart` or dev start)

```ts
async buildStart() {
  await runPipeline(projectRoot, vaultDir);
  // Plugin writes src/lib/generated/manifest.json
}
```

After pipeline completes, SvelteKit's prerenderer calls `entries()` and generates the pages.

### On vault change (dev mode only)

```ts
watcher.on("change", async (filePath) => {
  await runPipeline(projectRoot, vaultDir);
  // Plugin re-writes src/lib/generated/manifest.json

  // Tell SvelteKit to rebuild
  server.ws.send({
    type: "full",
    event: "special",
    event_name: "svartz:vault-updated",
  });
});
```

The HMR signal tells dev server to re-run page hydration and re-check `entries()`.

---

## Multi-vault gotcha

If you have **multiple vaults** (e.g. `/docs` vault + `/notes` vault), and **one SvelteKit app**:

- Each vault produces its own **manifest** → each should be isolated.
- The route's `entries()` needs to know which vault is "active" (from env var).
- Option 1: Write manifests to separate files: `src/lib/generated/manifest-docs.json`, `src/lib/generated/manifest-notes.json`.
- Option 2: Write one combined manifest with vault namespacing: `{ docs: { notes: [...] }, notes: { notes: [...] } }`.
- Then in `entries()`, filter based on `process.env.VAULT_DIR` or similar.

```ts
export const entries: EntryGenerator = async () => {
  const vaultName = new URL(import.meta.url).pathname.split("/").at(-3); // hacky; better to use env
  const manifest = await import(`$lib/generated/manifest-${vaultName}.json`);
  return manifest.notes.map((note) => ({ slug: note.slug }));
};
```

Or simpler: one manifest per build (since `VAULT_DIR` env var is set per build):

```ts
// Plugin always writes to the same location, and overwrite is fine because one vault per build
// src/lib/generated/manifest.json
```

---

## Summary

| Layer                   | Job                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **Plugin**              | Run content pipeline → write `src/lib/generated/manifest.json` → on change, re-run + HMR |
| **Route (`entries()`)** | Read manifest → return list of slugs for prerenderer                                     |
| **Prerenderer**         | Call `entries()`, generate one `.html` per slug                                          |
| **Page component**      | Read manifest or load data, render the note                                              |

So: **plugin feeds the manifest, route reads it to tell SvelteKit what to prerender, SvelteKit generates the static pages.**

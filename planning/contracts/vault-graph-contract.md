# Contract: Vault Graph Generation

## Overview

The `buildGraph()` function derives a deduplicated graph of outgoing links from an Index. The graph maps each note's slug to its unique target notes, with metadata (title, tags) resolved from the index.

The graph is a separate artifact from the index, emitted to `graph.json` (or handled by the caller). The Index type no longer includes a `graph` property.

**Build / Turbo cache**: Keeping the graph as a separate artifact enables a layered cache: only the index (and graph derived from it) need to be rebuilt when vault content changes; downstream tasks that consume index/graph can stay cached until those inputs change.

---

## Types

### GraphTarget

```ts
export interface GraphTarget {
  readonly slug: string;
  readonly title: string;
  readonly tags: string[];
}
```

A single outgoing link target from the perspective of a source note. Fields:
- **slug**: The canonical slug of the target note.
- **title**: The title of the target note (from its IndexEntry).
- **tags**: The tags of the target note (from its IndexEntry).

### Graph

```ts
export interface Graph {
  readonly [sourceSlug: string]: GraphTarget[];
}
```

Maps each note's slug to an array of its deduplicated outgoing link targets. Each target appears **at most once** per source, even if the source has multiple links to the same target (e.g., different sections).

### Index (updated)

```ts
export interface Index {
  readonly version: string;
  readonly notes: IndexEntry[];
  // Removed: readonly graph: Record<string, string[]>;
}
```

The `graph` property is removed. The index is now the single source of truth for notes and their `links` (as `IndexLink[]`).

---

## buildGraph Function

**Location**: `packages/vault/src/indexer.ts` (or a dedicated file)

**Signature**:

```ts
export const buildGraph = (index: Index): Graph;
```

**Description**:

Derives a graph from an Index by:

1. Building a lookup map: `entryBySlug: Record<string, IndexEntry>`.
2. For each note in `index.notes`:
   - Collect **unique** target slugs from the note's `links` array (by `link.href`, filtering nulls and deduplicating with a Set).
   - For each unique target slug:
     - Look up the target entry in `entryBySlug`.
     - If the target exists, create a `GraphTarget` with slug, title, tags.
     - Add the target to the graph's entry for this source.
3. Return the graph.

**Pseudocode**:

```ts
const buildGraph = (index: Index): Graph => {
  const entryBySlug = Object.fromEntries(
    index.notes.map((entry) => [entry.slug, entry])
  );

  const graph: Graph = {};

  for (const entry of index.notes) {
    // Deduplicate: collect unique hrefs from this note's links
    const uniqueTargetSlugs = [...new Set(
      entry.links
        .map((link) => link.href)
        .filter((href): href is string => href !== null)
    )];

    // For each unique target, resolve the target entry and extract metadata
    const targets: GraphTarget[] = [];
    for (const targetSlug of uniqueTargetSlugs) {
      const targetEntry = entryBySlug[targetSlug];
      if (targetEntry) {
        targets.push({
          slug: targetEntry.slug,
          title: targetEntry.title,
          tags: targetEntry.tags,
        });
      }
    }

    graph[entry.slug] = targets;
  }

  return graph;
};
```

---

## Invariants

1. **Deterministic**: The same Index always produces the same Graph.
2. **Deduplicated by target slug**: Each target slug appears at most once in a source's target list, regardless of how many times the source links to it (e.g., `[[note#section1]]` and `[[note#section2]]` both resolve to `note` → `note` appears once).
3. **Lossy for missing targets**: If a link has `href: null` (unresolved) or the target slug is not in the index (e.g., a broken link to a non-existent note), it is omitted from the graph. No error is raised.
4. **Order preserved**: Targets appear in the order of **first occurrence** in the source note's `links` array (after deduplication).
5. **JSON-serializable**: All fields (slug, title, tags) are primitives; the graph can be directly serialized with `JSON.stringify`.

---

## Exports

**File**: `packages/vault/src/index.ts`

Add or update exports:

```ts
export type { Graph, GraphTarget } from "./types.js";
export { buildGraph } from "./indexer.js";
```

---

## Usage in CLI

**File**: `packages/vault/src/cli.ts`

After calling `buildIndex`, call `buildGraph` and write both artifacts:

```ts
const index = await buildIndex(files, options);
const graph = buildGraph(index);

// Write index.json
mkdirSync(dirname(indexPath), { recursive: true });
writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");

// Write graph.json
mkdirSync(dirname(graphPath), { recursive: true });
writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

console.log(`✓ Generated index: ${indexPath}`);
console.log(`✓ Generated graph: ${graphPath}`);
```

---

## Consumers

The `buildGraph` function is a library export, so consumers can:

1. **CLI / build tools**: Load an Index and call `buildGraph` to generate graph.json.
2. **Apps / plugins**: Load index.json and graph.json separately, or call `buildGraph(index)` in-memory to derive the graph on the fly (e.g., for fast rebuilds during development).
3. **Vite plugin**: Consume both artifacts; use `entry.links` for href resolution and the graph for backlinks/relationship views.

---

## Notes

- **No backlinks in this contract**: The graph is forward links only (source → targets). Backlinks (target ← sources) can be derived by inverting the graph in consumer code if needed.
- **No dead links included**: Missing targets are silently omitted; the graph only contains links to notes that exist in the index.
- **Future enhancement**: If consumers need to preserve "attempted link" info (e.g., unresolved links or external URLs), that could be added to a separate `brokenLinks` or `externalReferences` structure, but it's out of scope for this contract.

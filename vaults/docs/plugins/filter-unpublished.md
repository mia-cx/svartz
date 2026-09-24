# Filter unpublished content

`core:filter-unpublished` runs after frontmatter parsing and before links, embeds, search, graph, and artifact emission. It keeps only public notes and attachments referenced by public notes.

By default, `publicationMode: "exclusion"` publishes every note except paths matching `exclude`. Set `publicationMode: "inclusion"` to publish only notes matching `include`, less any `exclude` matches.

```ts
export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "notes",
    path: "vaults/notes",
    target: { type: "static" },
    publicationMode: "inclusion",
    include: ["posts/**"],
    exclude: ["posts/internal/**"],
  }],
});
```

Frontmatter overrides path patterns in this order:

1. `draft: true` hides the note.
2. A nonempty `published_at` publishes it immediately, even when its date is in the future or the path was excluded.
3. `private: true` always hides it.

Only the boolean value `true` activates `draft` or `private`. Other values do not. A configured `frontmatter.publishedField` can also name the publication date field; `published_at` remains recognized.

The filter removes unpublished notes before link resolution and embeds. A reference to an unpublished note cannot put its title, body, graph edge, search record, or route into the public output. Attachments are copied only when public note content references them. Attachment paths in `exclude` stay excluded even if a public note links to them.

An unresolved link does not fail the build. It does not create a graph edge.

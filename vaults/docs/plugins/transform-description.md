# Transform description

`transformDescription()` provides `core:transform-description` in the `transformDescription` stage. For each published note, it derives a title if needed. It preserves a configured frontmatter description or extracts one from the Markdown body. The result remains in `file.frontmatter` for indexing and page metadata.

This hook runs after TOC extraction and before syntax, math, embeds, and indexing. See [[plugins/overview]].

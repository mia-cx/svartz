---
title: Transform Description
---

# Transform description

`transformDescription()` provides `core:transform-description` in the `transformDescription` stage. For each published note without a `title`, it takes the filename as written, as Obsidian does. It preserves a configured frontmatter description or extracts one from the Markdown body. The result remains in `file.frontmatter` for indexing and page metadata.

This hook runs after TOC extraction and before syntax, math, embeds, and indexing. See [[plugins/overview]].

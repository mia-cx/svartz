---
title: "The build pipeline"
order: 1
description: "See where Svartz discovers, filters, transforms, and emits content."
---

Svartz discovers vault files, parses frontmatter, filters unpublished notes, assigns routes, and resolves links. It transforms the published Markdown, builds the index and link graph, and emits page artifacts, assets, and discovery files. The site then renders those artifacts through its theme.

Explore the built-in behavior under [[writing|Writing notes]]. You do not install a separate plugin for filenames, wikilinks, callouts, syntax highlighting, math, or the search index.

An optional plugin can normalize source before frontmatter parsing, add a compiler step, emit a browser resource, or register server code. The [[reference/plugin-contract|plugin contract]] lists stages and ordering; [[guides/create-plugin|Create a plugin]] shows how to hook into one.

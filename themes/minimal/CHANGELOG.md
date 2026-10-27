# @svartz/theme-minimal

## 1.2.1

### Patch Changes

- Updated dependencies [ce77637]
  - @svartz/ui@1.2.1
  - @svartz/core@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies [1debbc9]
  - @svartz/ui@1.2.0
  - @svartz/core@1.2.0

## 1.1.1

### Patch Changes

- @svartz/core@1.1.1
  - @svartz/ui@1.1.1

## 1.1.0

### Minor Changes

- 67b759b: Every public page now has a Markdown copy for LLM agents at `<page>.md`, linked from the page with `<link rel="alternate" type="text/markdown">`, and each vault lists its copies in `llms.txt`. Every theme adds Copy page and View as Markdown buttons to notes. Turn it off with `discovery.llms.enabled: false`.
- c2b31c8: Notes and folders can set their place in the explorer and the wiki section bar with an `order` number in their frontmatter, lowest first. A folder takes its folder note's `order`; anything without one follows in title order.

### Patch Changes

- Updated dependencies [67b759b]
- Updated dependencies [c2b31c8]
- Updated dependencies [6a78dcc]
  - @svartz/core@1.1.0
  - @svartz/ui@1.1.0

## 1.0.1

### Patch Changes

- @svartz/ui@1.0.1
  - @svartz/core@1.0.1

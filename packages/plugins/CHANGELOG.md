# @svartz/plugins

## 1.0.1

### Patch Changes

- dd069ad: Code blocks no longer emit a Svelte `a11y_no_noninteractive_tabindex` warning. The `<pre>` stays focusable so keyboards can scroll it.
- 6dd3049: Markdown links such as `[API](index.md)` resolve against the linking note's folder before vault-wide lookup, so sibling `index.md` files, `../` paths, and duplicate filenames reach the right note and its heading anchor.
- @svartz/core@1.0.1

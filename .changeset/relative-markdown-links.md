---
"@svartz/plugins": patch
---

Markdown links such as `[API](index.md)` resolve against the linking note's folder before vault-wide lookup, so sibling `index.md` files, `../` paths, and duplicate filenames reach the right note and its heading anchor.

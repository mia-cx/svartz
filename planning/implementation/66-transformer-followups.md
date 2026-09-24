# #66 V1 content transformers

Ship the six backend gaps reported during theme authoring. Keep theme styling in #21.

- [x] Tests: link/embeds, tag indexing, callout structure, code language, and Mermaid browser lifecycle.
- [x] Capture Knowledge: record non-obvious parser and browser-resource rules.
- [x] Documentation: describe inline tags, missing links, and Mermaid authoring.
- [x] Review & Close: inspect publication boundaries, host mounts, and generated output, then push a reviewable PR.

Review follow-up: extraction and rewrites now share parsed Markdown link spans. Code samples, raw HTML, escaped prose, and embeds stay out of the graph. TOC and section embeds use the same heading parser, including Setext and duplicate IDs. Inline tags skip authored links, flow into published embeds, and merge with normalized frontmatter tags. The content transformer rule applies to the files it names.

Validation: 124 plugin tests, 28 serial CLI tests, and the plugin package build pass after the parser follow-up; all seven package builds passed before it. The CLI browser case renders public and unlocked protected Mermaid diagrams, scans static output for private source, and the host case verifies a mounted inline tag link. Tests run serially on this VM.

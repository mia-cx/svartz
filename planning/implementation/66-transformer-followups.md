# #66 V1 content transformers

Ship the six backend gaps reported during theme authoring. Keep theme styling in #21.

- [x] Tests: link/embeds, tag indexing, callout structure, code language, and Mermaid browser lifecycle.
- [x] Capture Knowledge: record non-obvious parser and browser-resource rules.
- [x] Documentation: describe inline tags, missing links, and Mermaid authoring.
- [x] Review & Close: inspect publication boundaries, host mounts, and generated output, then push a reviewable PR.

Review follow-up: wikilink rewrites now respect parsed Markdown text nodes, including code samples. Inline tags skip authored links, flow into published embeds, and merge with normalized frontmatter tags. The content transformer rule applies to the files it names.

Validation: 120 plugin tests, 28 serial CLI tests, and all seven package builds pass. The CLI browser case renders public and unlocked protected Mermaid diagrams, scans static output for private source, and the host case verifies a mounted inline tag link. Tests run serially on this VM.

# #66 V1 content transformers

Ship the six backend gaps reported during theme authoring. Keep theme styling in #21.

- [x] Tests: link/embeds, tag indexing, callout structure, code language, and Mermaid browser lifecycle.
- [x] Capture Knowledge: record non-obvious parser and browser-resource rules.
- [x] Documentation: describe inline tags, missing links, and Mermaid authoring.
- [x] Review & Close: inspect publication boundaries, host mounts, and generated output, then push a reviewable PR.

Validation: 115 plugin tests and 28 serial CLI tests pass. The CLI browser case renders public and unlocked protected Mermaid diagrams, scans static output for private source, and the host case verifies a mounted inline tag link. The earlier workspace run passed 15 of 16 tasks; the CLI task timed out while parallel browser/build files competed for this VM. Serial CLI tests now pass.

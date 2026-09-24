# Obsidian code span review fix

- [x] Tests: cover nested list prose, actual indented/fenced/inline code, and nested placeholder restoration; 151 plugin tests and package build pass.
- [x] Capture knowledge: record that OFM code protection follows Markdown AST positions.
- [x] Documentation: explain that nested list comments and highlights transform while code stays literal.
- [ ] Review & close: inspect the diff, run plugin tests and build, then address review threads. Close #79 only when merged.

Keep this change in the transformer. Do not touch UI theme files.

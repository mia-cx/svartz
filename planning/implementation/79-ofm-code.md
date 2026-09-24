# Obsidian code span review fix

- [ ] Tests: cover nested list prose, actual indented/fenced/inline code, and segment restoration with placeholder-like text.
- [ ] Capture knowledge: record that OFM code protection follows Markdown AST positions.
- [ ] Documentation: explain that nested list comments and highlights transform while code stays literal.
- [ ] Review & close: inspect the diff, run plugin tests and build, then address review threads. Close #79 only when merged.

Keep this change in the transformer. Do not touch UI theme files.

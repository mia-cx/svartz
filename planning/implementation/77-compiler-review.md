# Compiler-stage review fixes

- [ ] Tests: cover embedded math, source-preserving search and word counts, disabled factory options, and a theme-provided required stage.
- [ ] Capture knowledge: update the plugin and theme pipeline rules for compiler contributions and validation timing.
- [ ] Documentation: describe the updated math and disabled-plugin behavior for consumers.
- [ ] Review & close: inspect the diff, run focused tests and package builds, then address review threads. Close #77 only when merged.

Implementation order: compiler math, factory options, then theme-stage validation. Keep the UI theme work untouched.

# Compiler-stage review fixes

- [x] Tests: cover embedded math in Markdown and SVX, source-preserving indexing, disabled factory options, and a theme-provided required stage; core 106, plugins 149, Vite 34 pass, with package builds.
- [x] Capture knowledge: update the plugin rule for late SVX transforms and validation after theme loading.
- [x] Documentation: describe rendered embedded math and disabled-plugin behavior for consumers.
- [ ] Review & close: inspect the diff, run focused tests and package builds, then address review threads. Close #77 only when merged.

Implementation order: compiler math, factory options, then theme-stage validation. Keep the UI theme work untouched.

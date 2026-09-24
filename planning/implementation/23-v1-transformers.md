# #23 Make Markdown transformers configurable

## Outcome

Active plugins alone control compiler steps and browser resources. Optional transforms can be disabled or replaced; required build stages remain present. `.svx` is the only executable Svelte note format.

## TODOs

- [x] Tests: verify ordered mutating hooks and required-stage validation.
- [x] Add typed compiler contributions; move GFM, math, and syntax setup into their hooks. Test disable and replacement behavior.
- [x] Let plugins contribute browser resources, reject unmet theme requirements, and verify repeat-build resource removal.
- [x] Compile `.md` as inert Markdown and `.svx` as executable Svelte, with a behavioral test.
- [x] Capture Knowledge: update plugin conventions with the compiler/resource lifecycle and stage requirements.
- [x] Documentation: update authoring and pipeline docs for plugin options and note formats.
- [ ] Review & Close: run focused and workspace checks, inspect build output, and file a stacked PR.

## Constraints

The accepted contract is in #29. Keep fixed stage names, same-ID replacement, pre/normal/post ordering, and host adapter support. Use #25 as this branch's base.

## Validation

- Step 1: package build, 90 core tests, and 16 Vite tests pass.
- Step 2: core and plugin builds plus 72 plugin tests pass. The emitter no longer installs math or highlighting itself.
- Step 3: 91 core and 19 Vite tests pass. A static docs build emitted KaTeX CSS/fonts for a math note; the next build removed them with the note.
- Step 4: 73 plugin tests and the docs static build pass. Svelte compiler AST confirms authored scripts execute only in `.svx`.
- Step 5: docs now describe dedicated stages, active compiler resources, and inert Markdown. A same-ID replacement test confirms old KaTeX resources do not survive.

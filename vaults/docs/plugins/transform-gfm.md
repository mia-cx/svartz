# Transform GFM

`transformGfm(options?)` provides `core:transform-gfm` in the `transformGfm` stage. It registers remark-gfm with the compiler. Tables, task lists, strikethrough, and autolinks render only while this hook is active. Pass remark-gfm options to the factory. The hook does not rewrite `file.content`.

Disable it with `{ id: "core:transform-gfm", disabled: true }` or replace the same ID. See [[contracts/plugin-contract]].

# Transform syntax

`transformSyntax(options?)` provides `core:transform-syntax` in the `transformSyntax` stage. It registers rehype-pretty-code when a published note contains a code block or inline code. Pass rehype-pretty-code options to the factory. The default theme is `github-dark-default` with `keepBackground: false`. The hook does not rewrite `file.content`.

Disable it with `{ id: "core:transform-syntax", disabled: true }` or replace the same ID. See [[contracts/plugin-contract]].

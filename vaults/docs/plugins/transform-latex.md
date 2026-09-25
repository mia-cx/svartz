# Transform LaTeX

`transformLatex(options?)` provides `core:transform-latex` in the `transformLatex` stage. It parses `$inline$` and `$$block$$` math in published notes and replaces those expressions with KaTeX HTML. Options go to KaTeX, except `displayMode`, which follows the math node. When math is used, the hook declares the KaTeX browser stylesheet. Without math, the stylesheet is absent from the build.

Disable it with `{ id: "core:transform-latex", disabled: true }` or replace the same ID. A replacement does not inherit KaTeX rendering or CSS. See [[contracts/plugin-contract]].

# Transform OFM

`transformOfm()` provides `core:transform-ofm` in the `transformOfm` stage. It rewrites Obsidian comments, `==highlights==`, and callout markers before Markdown compilation. It protects code spans, fenced code, and HTML comments during those changes. Link resolution and embeds have separate hooks.

The stage runs before GFM, syntax, and math. Content transforms run serially. See [[contracts/plugin-contract]].

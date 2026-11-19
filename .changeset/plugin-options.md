---
"@svartz/core": minor
"@svartz/plugins": minor
---

A plugin can say what it was made from and what it reads. `options` on `SvartzPlugin` holds plain data, such as a factory's options merged over its defaults, and `reads` lists the files its hooks read while building, as paths from the vault's folder or absolute ones. Normalization keeps both. A plugin's hooks close over their options, where nothing outside can read them, and `options` can only name a file. So `@svartz/plugin-history`'s version cache reads `options` and the contents of every `reads` file, and compiles a post's versions again when either changes. A plugin whose output depends on values it closes over should put them in `options`, and the files it reads in `reads`.

Every option-taking plugin in `@svartz/plugins` sets `options` to its effective options: `roamFlavoredMarkdown`, `oxHugoFlavoredMarkdown`, `presentation`, `citations`, `transformGfm`, `transformSyntax` and `transformLatex`. `citations` also lists its bibliographies in `reads`, and its style when that is a `.csl` file.

`citations` now renders every note of a build that cites the bibliography. rehype-citation resolved the bibliography's path in place, so every note after the first looked for it below the vault twice over and failed.

---
"@svartz/core": minor
"@svartz/plugins": minor
---

A plugin can say what it was made from: `options` on `SvartzPlugin` holds plain data, such as a factory's options merged over its defaults, and normalization keeps it. A plugin's hooks close over their options, where nothing outside can read them; `@svartz/plugin-history`'s version cache reads `options` instead, and compiles a post's versions again when it changes. A plugin whose output depends on values it closes over should put them in `options`.

Every option-taking plugin in `@svartz/plugins` sets it: `roamFlavoredMarkdown`, `oxHugoFlavoredMarkdown`, `presentation`, `citations`, `transformGfm`, `transformSyntax` and `transformLatex`, each with its effective options.

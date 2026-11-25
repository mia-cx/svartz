---
title: "Docs"
description: "Publish guides and one reference page per exported package symbol."
---

Try the [package docs demo](https://docs.demo.svartz.mia.cx). Install `@svartz/theme-docs` and set:

```ts
theme: {
  base: "@svartz/theme-docs",
  version: "1.0.0",
  routes: { folders: "api" },
  nav: { GitHub: "https://github.com/example/package" },
},
```

`version` is an optional badge string. `nav` is a map of labels to header URLs. The home shows the home note followed by module cards. The folder index groups symbols by kind; individual folder listings show one module. Notes without `symbol` render as guides.

```yaml
symbol:
  kind: function
  name: calibrate
  signature: "calibrate(reading: number): number"
  parameters:
    - { name: reading, type: number, description: The uncorrected reading. }
  returns: { type: number, description: The corrected reading. }
  since: "1.0.0"
```

`kind` can be `namespace`, `class`, `interface`, `type`, `enum`, `function`, or `variable`. The `DocSymbol` type also supports `signatures` for overloads, `typeParameters`, `throws`, `extends`, `implements`, `members`, `source`, and `deprecated`. Types and descriptions can include wikilinks and inline code.

Docs extends [[themes/minimal|minimal]], keeping its explorer, search, and previous and next links. The symbol renderer adds signatures and reference sections; the explorer puts kind badges beside symbols.

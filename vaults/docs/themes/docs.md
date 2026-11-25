---
title: "Docs"
description: "Publish guides and one reference page per exported package symbol."
---

Try the [package docs demo](https://docs.demo.svartz.dev). Install `@svartz/theme-docs` and configure `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "docs",
      path: "vault",
      target: { type: "static" },
      theme: {
        base: "@svartz/theme-docs",
        version: "1.0.0",
        routes: { folders: "api" },
        nav: { GitHub: "https://github.com/example/package" },
      },
    },
  ],
});
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

Top-level page kinds grouped on the folder index are `namespace`, `class`, `interface`, `type`, `enum`, `function`, and `variable`. `kind` also accepts `method`, `property`, `constructor`, and `accessor` (used for entries under `members`). The `DocSymbol` type also supports `signatures` for overloads, `typeParameters`, `throws`, `extends`, `implements`, `members`, `source`, and `deprecated`. Types and descriptions can include wikilinks and inline code.

Docs extends [[themes/minimal|minimal]], keeping its explorer, search, and previous and next links. The symbol renderer adds signatures and reference sections; the explorer puts kind badges beside symbols.

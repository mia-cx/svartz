---
title: "Hard line breaks"
description: "Turn a single prose newline into a rendered line break."
---

Run `npm install -D @svartz/plugins` and add `hardLineBreaks()` in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { hardLineBreaks } from "@svartz/plugins";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      plugins: [hardLineBreaks()],
    },
  ],
});
```

The factory takes no options and needs no frontmatter or server.

Use it when line breaks in source prose should be visible, such as in verse. It applies to the whole vault. It changes soft line breaks, not code or paragraph spacing. Leave it off if you use newlines to wrap paragraphs in the editor.

API reference: [[reference/api/plugins/hardLineBreaks|hardLineBreaks]].

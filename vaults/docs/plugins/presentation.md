---
title: "Presentation"
description: "Present a published note as a fullscreen slide deck."
---

Install `@svartz/plugins` with `npm install -D @svartz/plugins` and add `presentation()` to a vault in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { presentation } from "@svartz/plugins";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      plugins: [presentation({ key: "p" })],
    },
  ],
});
```

`key` is an optional string, default `"p"`. No frontmatter is needed. Put a top-level horizontal rule (`---` on its own line, with a blank line above it) between slides. A rule inside a callout or quote does not split the slide.

Open [Weather station slides](https://minimal.demo.svartz.dev/reference/slides/) and press P. Use the arrow keys or Space to advance, Shift+Space to go back, and Esc to leave. Slides are static copies of the rendered note, so interactive controls such as copy buttons are not available. The trigger is ignored in editable fields and with Ctrl, Command, or Alt held.

API reference: [[reference/api/plugins/presentation|presentation]] and [[reference/api/plugins/PresentationOptions|PresentationOptions]].

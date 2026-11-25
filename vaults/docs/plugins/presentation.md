---
title: "Presentation"
description: "Present a published note as a fullscreen slide deck."
---

Install `@svartz/plugins` with `npm install -D @svartz/plugins`. Add this import and the factory to your vault:

```ts
import { presentation } from "@svartz/plugins";
// In the vault entry:
// plugins: [presentation({ key: "p" })],
```

`key` is an optional string, default `"p"`. No frontmatter is needed. Put a top-level horizontal rule (`---` on its own line, with a blank line above it) between slides. A rule inside a callout or quote does not split the slide.

Open [Weather station slides](https://minimal.demo.svartz.mia.cx/reference/slides/) and press P. Use the arrow keys or Space to advance, Shift+Space to go back, and Esc to leave. Slides are static copies of the rendered note, so interactive controls such as copy buttons are not available. The trigger is ignored in editable fields and with Ctrl, Command, or Alt held.

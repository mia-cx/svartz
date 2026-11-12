# `@svartz/plugin-annotations`

Readers' comments beside the passage they respond to, highlighted in the note with a marker in the margin. Signed-in readers select a passage and comment on it, and **+1** the comments they agree with. Stored in Cloudflare D1, which the plugin sets up on first use. Needs `@svartz/auth` on the same vault.

```ts
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";

plugins: [auth({ providers: { … } }), annotations({ database: { env: "DB" } })]
```

```ts
import { attach } from "@svartz/plugin-annotations/browser";
import "@svartz/plugin-annotations/browser.css";

const detach = attach(noteElement, { endpoint: "/_svartz/annotations", page: "garden/roses" });
```

Setup, the D1 binding, options and styling: [docs/annotations.md](../../docs/annotations.md).

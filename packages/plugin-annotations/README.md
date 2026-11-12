# `@svartz/plugin-annotations`

Readers' comments beside the passage they respond to, highlighted in the note with a marker in the margin. Signed-in readers select a passage and comment on it, and **+1** the comments they agree with. Stored in Cloudflare D1, which the plugin sets up on first use. Needs `@svartz/auth` on the same vault.

```ts
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";

plugins: [auth({ providers: { … } }), annotations({ database: { env: "DB" } })]
```

That is all a theme-minimal site needs, and any theme extending it: every note shows its annotations. So does a host app page that renders a note with `SvartzNoteContent`. On markup a host app renders itself, call `attach` on the content element with the note's vault and slug:

```ts
import { attach } from "@svartz/plugin-annotations/browser";
import "@svartz/plugin-annotations/browser.css";
import { vaults } from "virtual:svartz/host";

const detach = attach(noteElement, { vault: vaults.find((vault) => vault.id === "notes")!, slug: "garden/roses" });
```

Setup, the D1 binding, options and styling: [docs/annotations.md](../../docs/annotations.md).

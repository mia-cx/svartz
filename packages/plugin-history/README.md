# `@svartz/plugin-history`

Every published page's history, with the diff between any two revisions, and Recent changes for the whole wiki. Read from the GitHub mirror that `@svartz/plugin-submissions` keeps with `sync` set, which the vault needs.

```ts
import { history } from "@svartz/plugin-history";

plugins: [auth({ … }), submissions({ repo, app, sync: { … } }), history()]
```

Pages: `/-/history/<page>` and `/-/changes/`, in the theme's shell, with a **History** action beside Edit. What they show, what stays out, and how far back they go: [docs/history.md](../../docs/history.md).

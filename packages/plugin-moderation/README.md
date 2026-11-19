# `@svartz/plugin-moderation`

Readers report pages, comments, accounts, submissions and commits, with a reason. Moderators work through the reports on the site's dashboard, resolve or dismiss each, hide a comment or close a submission through the plugin that owns it, and suspend accounts for a while or for good, all on the record in auth's audit log, which the Audit log panel shows. Needs `@svartz/auth` with accounts on the same vault: reports are kept in its accounts database, `SVARTZ_DB`, which the plugin sets up on first use. Hiding a comment needs annotations to keep its comments there too.

```ts
import { auth } from "@svartz/auth";
import { moderation } from "@svartz/plugin-moderation";

plugins: [auth({ providers: { … } }), moderation()]
```

Setup, permissions, the Reports, Suspensions and Audit log panels, and routes: [docs/moderation.md](../../docs/moderation.md).

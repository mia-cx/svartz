---
title: "Moderation"
description: "Queue reader reports and manage suspensions from the dashboard."
---

Run `npm install -D @svartz/plugin-moderation @svartz/auth` and add `moderation()` alongside [[plugins/auth|auth]] in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";
import { moderation } from "@svartz/plugin-moderation";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: {
        type: "cloudflare-workers",
        d1_databases: [{ binding: "SVARTZ_DB", database_name: "notes", database_id: "<id>" }],
      },
      plugins: [
        auth({
          providers: {
            github: {
              clientId: "Iv23liExample",
              clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" },
            },
          },
          admins: ["github:583231"],
        }),
        moderation({ limits: { reportsPerHour: 10 } }),
      ],
    },
  ],
});
```

Use a Cloudflare target and bind D1 as `SVARTZ_DB`. The plugin creates its tables on first use.

`limits.reportsPerHour` is an optional positive integer, default 10 per reader per clock hour. No note frontmatter is needed. Signed-in readers can report a published page or account and give a reason of at most 1,000 characters. Installed plugins can also add reports on comments, submissions, or commits.

Moderators open the Reports, Suspensions, and Audit log panels at `/-/dashboard/`. Grants control which panels and actions they can use. To hide comments from reports, configure [[plugins/annotations|annotations]] to use `SVARTZ_DB`. Closing submissions needs [[plugins/submissions|submissions with sync]] and the review permission. Reverting is a separate [[plugins/history|history]] action. Resolve the report after taking any of those actions.

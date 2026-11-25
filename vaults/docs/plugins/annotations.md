---
title: "Annotations"
description: "Let readers comment on a selected passage."
---

Run `npm install -D @svartz/plugin-annotations @svartz/auth` and add `annotations()` alongside [[plugins/auth|auth]] in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";

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
        }),
        annotations({ database: { env: "SVARTZ_DB" } }),
      ],
    },
  ],
});
```

Use Workers, Pages, or a Cloudflare SvelteKit host; the plugin needs D1 and creates its tables on first use.

| Option | Type | Default |
| --- | --- | --- |
| `database` | `{ env: string }`, naming a D1 binding | Required |
| `reactions` | List of `{ id: string; label: string; src: string }`; accepted in config, while runtime currently supports comments and `+1` agreements | Empty |
| `moderators` | List of identity IDs; prefer a permission grant | Empty |
| `limits.writesPerHour` | Positive integer | 30 per reader per clock hour |

Anyone can read comments. Signed-in readers can select text, comment, agree with a comment, and delete their own. Light edits can keep an annotation anchored; if its passage is gone the comment moves to a separate list below the note. Comments are keyed by slug, so changing it leaves the existing comments under the old one.

Selections can be up to 1,000 characters and comments up to 2,000. There is no frontmatter to add. Protected notes and listing pages do not show annotations. A custom theme needs to mark the note body, or a host can use `SvartzNoteContent` or `attach` from `@svartz/plugin-annotations/browser`. To hide comments through [[plugins/moderation|moderation]], use the accounts database `SVARTZ_DB` for annotations too.
